import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'myskylight.db');

// Create a better-sqlite3 compatible wrapper around sql.js
function createDbWrapper(sqliteDb) {
  return {
    prepare(sql) {
      return {
        get(...params) {
          const stmt = sqliteDb.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : null;
          stmt.free();
          return row || undefined;
        },
        all(...params) {
          const stmt = sqliteDb.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        run(...params) {
          const stmt = sqliteDb.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          stmt.step();
          stmt.free();
          const lid = sqliteDb.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0];
          const changes = sqliteDb.getRowsModified();
          return { lastInsertRowid: lid ?? 0, changes: changes ?? 0 };
        }
      };
    },
    exec(sql) {
      sqliteDb.exec(sql);
    },
    pragma(statement) {
      sqliteDb.run(`PRAGMA ${statement}`);
    }
  };
}

// Initialize sql.js and load/create database (locateFile helps on Node/Termux)
const SQL = await initSqlJs({
  locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
});
let rawDb;

if (fs.existsSync(dbPath)) {
  const buffer = fs.readFileSync(dbPath);
  rawDb = new SQL.Database(buffer);
} else {
  rawDb = new SQL.Database();
}

const db = createDbWrapper(rawDb);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Save database to file (call after mutations)
function saveDb() {
  const data = rawDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS households (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    head_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    avatar TEXT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('head', 'member')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_group_members (
    group_id INTEGER REFERENCES task_groups(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL CHECK(task_type IN ('daily', 'weekly', 'monthly', 'one-time', 'event')),
    recurrence_pattern TEXT,
    default_stars INTEGER DEFAULT 1,
    is_group_task INTEGER DEFAULT 0,
    group_id INTEGER REFERENCES task_groups(id) ON DELETE SET NULL,
    due_date DATE,
    start_time TEXT,
    end_time TEXT,
    is_all_day INTEGER DEFAULT 1,
    is_personal INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    workflow_status TEXT NOT NULL DEFAULT 'backlog',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    archived_at DATETIME,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_assignments (
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    stars_earned INTEGER DEFAULT 1,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(user_id);
  CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);

  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(habit_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
  CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id);
  CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);

  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    publish_date DATE NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS challenge_participants (
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_key TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    text_class TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (challenge_id, participant_key)
  );

  CREATE TABLE IF NOT EXISTS challenge_goals (
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_key TEXT NOT NULL,
    max_calories INTEGER NOT NULL DEFAULT 0,
    workout_minutes INTEGER NOT NULL DEFAULT 0,
    min_steps INTEGER NOT NULL DEFAULT 0,
    protein_grams INTEGER NOT NULL DEFAULT 0,
    water_liters REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (challenge_id, participant_key)
  );

  CREATE TABLE IF NOT EXISTS challenge_daily_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    participant_key TEXT NOT NULL,
    calories INTEGER NOT NULL DEFAULT 0,
    workout_minutes INTEGER NOT NULL DEFAULT 0,
    steps INTEGER NOT NULL DEFAULT 0,
    protein_grams INTEGER NOT NULL DEFAULT 0,
    water_liters REAL NOT NULL DEFAULT 0,
    healthy_bonus INTEGER NOT NULL DEFAULT 0,
    sleep_hours REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, entry_date, participant_key)
  );

  CREATE INDEX IF NOT EXISTS idx_challenges_created_by ON challenges(created_by);
  CREATE INDEX IF NOT EXISTS idx_challenge_daily_entries_date ON challenge_daily_entries(challenge_id, entry_date);
`);

// Backward-compatible migration for existing databases.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
const hasColorColumn = userColumns.some((column) => column.name === 'color');
if (!hasColorColumn) {
  db.exec("ALTER TABLE users ADD COLUMN color TEXT DEFAULT '#6366f1'");
}
const hasAvatarColumn = userColumns.some((column) => column.name === 'avatar');
if (!hasAvatarColumn) {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
}
const hasHouseholdIdColumn = userColumns.some((column) => column.name === 'household_id');
if (!hasHouseholdIdColumn) {
  db.exec('ALTER TABLE users ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE');
}
const hasRoleColumn = userColumns.some((column) => column.name === 'role');
if (!hasRoleColumn) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id)');

const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
const hasIsPersonalColumn = taskColumns.some((column) => column.name === 'is_personal');
if (!hasIsPersonalColumn) {
  db.exec('ALTER TABLE tasks ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0');
}
const hasProjectIdColumn = taskColumns.some((column) => column.name === 'project_id');
if (!hasProjectIdColumn) {
  db.exec('ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');
}
const hasWorkflowStatusColumn = taskColumns.some((column) => column.name === 'workflow_status');
if (!hasWorkflowStatusColumn) {
  db.exec("ALTER TABLE tasks ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'backlog'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_personal ON tasks(is_personal)');
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_workflow_status ON tasks(workflow_status)');

const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
const hasIsArchivedColumn = projectColumns.some((column) => column.name === 'is_archived');
if (!hasIsArchivedColumn) {
  db.exec('ALTER TABLE projects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0');
}
const hasArchivedAtColumn = projectColumns.some((column) => column.name === 'archived_at');
if (!hasArchivedAtColumn) {
  db.exec('ALTER TABLE projects ADD COLUMN archived_at DATETIME');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_projects_is_archived ON projects(is_archived)');

// Keep historical personal tracker tasks categorized as personal.
db.prepare(`
  UPDATE tasks
  SET is_personal = 1
  WHERE recurrence_pattern = 'personal_tracker'
`).run();

// Backfill households for users created before households existed.
// Every user must belong to a household; the oldest user becomes the head.
const usersWithoutHousehold = db.prepare(`
  SELECT id FROM users WHERE household_id IS NULL ORDER BY id
`).all();
if (usersWithoutHousehold.length > 0) {
  let defaultHousehold = db.prepare('SELECT id, head_user_id FROM households ORDER BY id LIMIT 1').get();
  if (!defaultHousehold) {
    const result = db.prepare('INSERT INTO households (name) VALUES (?)').run('MySkylight Household');
    defaultHousehold = { id: result.lastInsertRowid, head_user_id: null };
  }

  const assignHousehold = db.prepare('UPDATE users SET household_id = ? WHERE id = ?');
  for (const user of usersWithoutHousehold) {
    assignHousehold.run(defaultHousehold.id, user.id);
  }

  if (!defaultHousehold.head_user_id) {
    const headUserId = usersWithoutHousehold[0].id;
    db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?').run(headUserId, defaultHousehold.id);
    db.prepare("UPDATE users SET role = 'head' WHERE id = ?").run(headUserId);
  }
}

// Guarantee that each household has a head.
const householdsWithoutHead = db.prepare('SELECT id FROM households WHERE head_user_id IS NULL').all();
for (const household of householdsWithoutHead) {
  const firstMember = db.prepare('SELECT id FROM users WHERE household_id = ? ORDER BY id LIMIT 1').get(household.id);
  if (firstMember) {
    db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?').run(firstMember.id, household.id);
    db.prepare("UPDATE users SET role = 'head' WHERE id = ?").run(firstMember.id);
  }
}

saveDb();

// Seed default data if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const bcrypt = (await import('bcryptjs')).default;
  const hash = bcrypt.hashSync('demo123', 10);

  const householdResult = db.prepare('INSERT INTO households (name) VALUES (?)').run('MySkylight Household');
  const householdId = householdResult.lastInsertRowid;

  const demoUserResult = db.prepare(`
    INSERT INTO users (name, email, password_hash, color, household_id, role)
    VALUES (?, ?, ?, ?, ?, 'head')
  `).run('Demo User', 'demo@myskylight.app', hash, '#6366f1', householdId);

  db.prepare(`
    INSERT INTO users (name, email, password_hash, color, household_id, role)
    VALUES (?, ?, ?, ?, ?, 'member')
  `).run('Family Member', 'family@myskylight.app', hash, '#ec4899', householdId);

  db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?').run(demoUserResult.lastInsertRowid, householdId);

  db.prepare(`
    INSERT INTO tasks (title, description, task_type, default_stars, is_group_task) VALUES
    ('Load dishwasher', 'Load and run the dishwasher', 'daily', 1, 0),
    ('Unload dishwasher', 'Empty dishwasher and put away', 'daily', 1, 0),
    ('Vacuum living room', 'Vacuum the main living area', 'weekly', 2, 0),
    ('Take out trash', 'Take garbage to curb', 'weekly', 1, 0),
    ('Team cleanup', 'Weekly household cleanup', 'weekly', 3, 1)
  `).run();
  saveDb();
}

// Wrap db methods to auto-save after mutations (run only, not get/all)
const originalPrepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const stmt = originalPrepare(sql);
  const origRun = stmt.run.bind(stmt);
  stmt.run = (...args) => {
    const result = origRun(...args);
    saveDb();
    return result;
  };
  return stmt;
};

export default db;
