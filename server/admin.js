import { randomBytes } from 'node:crypto';
import db from './database.js';
import { authMiddleware, hashPassword } from './auth.js';

const SYSTEM_HOUSEHOLD_NAME = 'Platform Administration';

function adminMiddleware(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  return next();
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getHouseholdForAdmin(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid household id' });
    return null;
  }

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(id);
  if (!household) {
    res.status(404).json({ error: 'Household not found' });
    return null;
  }
  if (household.is_system) {
    res.status(400).json({ error: 'The system household cannot be managed here' });
    return null;
  }
  return household;
}

function getMemberForAdmin(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid member id' });
    return null;
  }

  const member = db.prepare(`
    SELECT u.*, h.is_system as household_is_system
    FROM users u
    JOIN households h ON h.id = u.household_id
    WHERE u.id = ?
  `).get(id);

  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return null;
  }
  if (member.is_admin || member.household_is_system) {
    res.status(400).json({ error: 'Administrator accounts cannot be managed here' });
    return null;
  }
  return member;
}

function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    color: member.color,
    avatar: member.avatar || null,
    role: member.role,
    created_at: member.created_at,
  };
}

function householdSummary(household) {
  return {
    id: household.id,
    name: household.name,
    head_user_id: household.head_user_id,
    head_name: household.head_name || null,
    head_email: household.head_email || null,
    member_count: Number(household.member_count) || 0,
    task_count: Number(household.task_count) || 0,
    project_count: Number(household.project_count) || 0,
    challenge_count: Number(household.challenge_count) || 0,
    created_at: household.created_at,
  };
}

function loadHouseholdSummary(id) {
  const household = db.prepare(`
    SELECT h.id, h.name, h.head_user_id, h.created_at,
      head.name as head_name, head.email as head_email,
      (SELECT COUNT(*) FROM users m WHERE m.household_id = h.id AND m.is_admin = 0) as member_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.household_id = h.id) as task_count,
      (SELECT COUNT(*) FROM projects p WHERE p.household_id = h.id) as project_count,
      (SELECT COUNT(*) FROM challenges c WHERE c.household_id = h.id) as challenge_count
    FROM households h
    LEFT JOIN users head ON head.id = h.head_user_id
    WHERE h.id = ? AND h.is_system = 0
  `).get(id);

  return household ? householdSummary(household) : null;
}

function loadHouseholdMembers(householdId) {
  return db.prepare(`
    SELECT id, name, email, color, avatar, role, created_at
    FROM users
    WHERE household_id = ? AND is_admin = 0
    ORDER BY CASE role WHEN 'head' THEN 0 ELSE 1 END, name COLLATE NOCASE
  `).all(householdId).map(publicMember);
}

function generateTemporaryPassword() {
  return randomBytes(24).toString('base64url');
}

function normalizeColor(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#6366f1';
}

export function registerAdminRoutes(app) {
  app.get('/api/admin/overview', authMiddleware, adminMiddleware, (req, res) => {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM households WHERE is_system = 0) as households,
        (SELECT COUNT(*) FROM users u
          JOIN households h ON h.id = u.household_id
          WHERE h.is_system = 0 AND u.is_admin = 0) as members,
        (SELECT COUNT(*) FROM tasks t
          JOIN households h ON h.id = t.household_id
          WHERE h.is_system = 0) as tasks,
        (SELECT COUNT(*) FROM projects p
          JOIN households h ON h.id = p.household_id
          WHERE h.is_system = 0) as projects,
        (SELECT COUNT(*) FROM challenges c
          JOIN households h ON h.id = c.household_id
          WHERE h.is_system = 0) as challenges
    `).get();

    res.json({
      households: Number(stats.households) || 0,
      members: Number(stats.members) || 0,
      tasks: Number(stats.tasks) || 0,
      projects: Number(stats.projects) || 0,
      challenges: Number(stats.challenges) || 0,
    });
  });

  app.get('/api/admin/households', authMiddleware, adminMiddleware, (req, res) => {
    const households = db.prepare(`
      SELECT h.id, h.name, h.head_user_id, h.created_at,
        head.name as head_name, head.email as head_email,
        (SELECT COUNT(*) FROM users m WHERE m.household_id = h.id AND m.is_admin = 0) as member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.household_id = h.id) as task_count,
        (SELECT COUNT(*) FROM projects p WHERE p.household_id = h.id) as project_count,
        (SELECT COUNT(*) FROM challenges c WHERE c.household_id = h.id) as challenge_count
      FROM households h
      LEFT JOIN users head ON head.id = h.head_user_id
      WHERE h.is_system = 0
      ORDER BY h.created_at DESC, h.id DESC
    `).all();

    res.json(households.map(householdSummary));
  });

  app.post('/api/admin/households', authMiddleware, adminMiddleware, (req, res) => {
    const { household_name: householdName, name, email, color } = req.body ?? {};
    const trimmedHouseholdName = typeof householdName === 'string' ? householdName.trim() : '';
    const headName = typeof name === 'string' ? name.trim() : '';
    const headEmail = typeof email === 'string' ? email.trim() : '';

    if (!trimmedHouseholdName || !headName || !headEmail) {
      return res.status(400).json({ error: 'Household name, head name, and head email are required' });
    }
    if (trimmedHouseholdName.length > 80 || headName.length > 80) {
      return res.status(400).json({ error: 'Names must be 80 characters or fewer' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(headEmail);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const temporaryPassword = generateTemporaryPassword();
    let householdId;

    try {
      const householdResult = db.prepare('INSERT INTO households (name, is_system) VALUES (?, 0)')
        .run(trimmedHouseholdName);
      householdId = householdResult.lastInsertRowid;

      const userResult = db.prepare(`
        INSERT INTO users (name, email, password_hash, color, household_id, role, is_admin)
        VALUES (?, ?, ?, ?, ?, 'head', 0)
      `).run(headName, headEmail, hashPassword(temporaryPassword), normalizeColor(color), householdId);

      db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?')
        .run(userResult.lastInsertRowid, householdId);
    } catch (err) {
      if (householdId) {
        db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
      }
      if (err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Email already registered' });
      }
      throw err;
    }

    const household = loadHouseholdSummary(householdId);
    const members = loadHouseholdMembers(householdId);
    res.status(201).json({
      household: { ...household, members },
      user: members[0],
      temporaryPassword,
    });
  });

  app.get('/api/admin/households/:id', authMiddleware, adminMiddleware, (req, res) => {
    const household = getHouseholdForAdmin(req, res);
    if (!household) return;

    const summary = loadHouseholdSummary(household.id);
    res.json({ ...summary, members: loadHouseholdMembers(household.id) });
  });

  app.patch('/api/admin/households/:id', authMiddleware, adminMiddleware, (req, res) => {
    const household = getHouseholdForAdmin(req, res);
    if (!household) return;

    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return res.status(400).json({ error: 'Household name must be between 1 and 80 characters' });
    }

    db.prepare('UPDATE households SET name = ? WHERE id = ?').run(name.trim(), household.id);
    res.json(loadHouseholdSummary(household.id));
  });

  app.delete('/api/admin/households/:id', authMiddleware, adminMiddleware, (req, res) => {
    const household = getHouseholdForAdmin(req, res);
    if (!household) return;

    // Break the head link first so deleting the members cannot conflict with it.
    db.prepare('UPDATE households SET head_user_id = NULL WHERE id = ?').run(household.id);
    db.prepare('DELETE FROM users WHERE household_id = ?').run(household.id);
    db.prepare('DELETE FROM households WHERE id = ?').run(household.id);
    res.json({ success: true });
  });

  app.post('/api/admin/households/:id/members', authMiddleware, adminMiddleware, (req, res) => {
    const household = getHouseholdForAdmin(req, res);
    if (!household) return;

    const { name, email, color } = req.body ?? {};
    const memberName = typeof name === 'string' ? name.trim() : '';
    const memberEmail = typeof email === 'string' ? email.trim() : '';

    if (!memberName || !memberEmail) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    if (memberName.length > 80) {
      return res.status(400).json({ error: 'Name must be 80 characters or fewer' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(memberEmail);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const temporaryPassword = generateTemporaryPassword();
    let userId;

    try {
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, color, household_id, role, is_admin)
        VALUES (?, ?, ?, ?, ?, 'member', 0)
      `).run(memberName, memberEmail, hashPassword(temporaryPassword), normalizeColor(color), household.id);
      userId = result.lastInsertRowid;
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Email already registered' });
      }
      throw err;
    }

    const member = db.prepare(`
      SELECT id, name, email, color, avatar, role, created_at FROM users WHERE id = ?
    `).get(userId);

    res.status(201).json({ user: publicMember(member), temporaryPassword });
  });

  app.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const member = getMemberForAdmin(req, res);
    if (!member) return;

    const { name, role } = req.body ?? {};
    const updates = {};

    if (Object.hasOwn(req.body ?? {}, 'name')) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
        return res.status(400).json({ error: 'Name must be between 1 and 80 characters' });
      }
      updates.name = name.trim();
    }

    if (Object.hasOwn(req.body ?? {}, 'role')) {
      if (role !== 'head' && role !== 'member') {
        return res.status(400).json({ error: 'Role must be head or member' });
      }
      if (role === 'member' && member.role === 'head') {
        return res.status(400).json({ error: 'Promote another member to head before demoting the current head' });
      }
      updates.role = role;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No member changes provided' });
    }

    if (updates.role === 'head') {
      db.prepare("UPDATE users SET role = 'member' WHERE household_id = ? AND role = 'head'")
        .run(member.household_id);
      db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?')
        .run(member.id, member.household_id);
    }

    const fields = Object.keys(updates);
    db.prepare(`
      UPDATE users SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?
    `).run(...fields.map((field) => updates[field]), member.id);

    const updated = db.prepare(`
      SELECT id, name, email, color, avatar, role, created_at FROM users WHERE id = ?
    `).get(member.id);

    res.json(publicMember(updated));
  });

  app.post('/api/admin/users/:id/reset-password', authMiddleware, adminMiddleware, (req, res) => {
    const member = getMemberForAdmin(req, res);
    if (!member) return;

    const temporaryPassword = generateTemporaryPassword();
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(temporaryPassword), member.id);

    res.json({
      temporaryPassword,
      user: { id: member.id, name: member.name, email: member.email },
    });
  });

  app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const member = getMemberForAdmin(req, res);
    if (!member) return;

    if (member.role === 'head') {
      return res.status(400).json({ error: 'Promote another member to head before removing the current head' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(member.id);
    res.json({ success: true });
  });
}

export { SYSTEM_HOUSEHOLD_NAME };
