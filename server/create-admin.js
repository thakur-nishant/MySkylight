import { randomBytes } from 'node:crypto';
import db from './database.js';
import { hashPassword } from './auth.js';

const rawArgs = process.argv.slice(2);
const force = rawArgs.includes('--force');
const args = rawArgs.filter((arg) => arg !== '--force');
const email = (args[0] || '').trim().toLowerCase();
const name = (args[1] || '').trim() || 'Administrator';
const providedPassword = args[2];

if (!email) {
  console.error('Usage: node create-admin.js <email> [name] [password] [--force]');
  process.exit(1);
}

const existing = db.prepare(`
  SELECT id, email, household_id, role, is_admin
  FROM users
  WHERE LOWER(email) = LOWER(?)
`).get(email);

if (existing && !existing.is_admin && !force) {
  console.error(
    `A household member already uses ${email}. Choose another email, or pass --force to convert the account.`
  );
  process.exit(1);
}

const password = providedPassword || randomBytes(24).toString('base64url');
const passwordHash = hashPassword(password);

let systemHousehold = db.prepare('SELECT id FROM households WHERE is_system = 1 ORDER BY id LIMIT 1').get();
if (!systemHousehold) {
  const result = db.prepare('INSERT INTO households (name, is_system) VALUES (?, 1)')
    .run('Platform Administration');
  systemHousehold = { id: result.lastInsertRowid };
}

if (existing) {
  // If a forced conversion removes the head of a household, hand it to another member.
  if (!existing.is_admin && existing.role === 'head') {
    const nextHead = db.prepare(`
      SELECT id FROM users
      WHERE household_id = ? AND id != ?
      ORDER BY id
      LIMIT 1
    `).get(existing.household_id, existing.id);

    if (nextHead) {
      db.prepare("UPDATE users SET role = 'head' WHERE id = ?").run(nextHead.id);
      db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?')
        .run(nextHead.id, existing.household_id);
    } else {
      db.prepare('UPDATE households SET head_user_id = NULL WHERE id = ?')
        .run(existing.household_id);
    }
  }

  db.prepare(`
    UPDATE users
    SET name = ?, password_hash = ?, household_id = ?, role = 'head', is_admin = 1
    WHERE id = ?
  `).run(name, passwordHash, systemHousehold.id, existing.id);
} else {
  db.prepare(`
    INSERT INTO users (name, email, password_hash, color, household_id, role, is_admin)
    VALUES (?, ?, ?, ?, ?, 'head', 1)
  `).run(name, email, passwordHash, '#0f172a', systemHousehold.id);
}

const admin = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?').run(admin.id, systemHousehold.id);

console.log('Admin account ready.');
console.log(`Email: ${email}`);
console.log(`Password: ${password}`);
if (!providedPassword) {
  console.log('Change this password after signing in for the first time.');
}
