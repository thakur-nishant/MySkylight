import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';
import db from './database.js';
import { hashPassword, verifyPassword, createToken, authMiddleware } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../client/dist');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// The app is normally served behind Caddy, which terminates TLS.
app.set('trust proxy', 1);
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const GOOGLE_ENABLED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SERVER_ORIGIN);

const WORKFLOW_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'done']);
const VALID_TASK_TYPES = new Set(['daily', 'weekly', 'monthly', 'one-time', 'event']);

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true'
  || (process.env.NODE_ENV !== 'production' && process.env.ALLOW_REGISTRATION !== 'false');

const USER_WITH_HOUSEHOLD_SELECT = `
  SELECT u.id, u.name, u.email, u.color, u.avatar, u.household_id, u.role, h.name as household_name
  FROM users u
  LEFT JOIN households h ON h.id = u.household_id
`;

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    color: user.color,
    avatar: user.avatar || null,
    household_id: user.household_id,
    household_name: user.household_name,
    role: user.role,
  };
}

function usersBelongToHousehold(userIds, householdId) {
  if (!Array.isArray(userIds)) return false;
  const ids = [...new Set(userIds.map(Number))];
  if (ids.length !== userIds.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return false;
  if (!ids.length) return true;
  const placeholders = ids.map(() => '?').join(', ');
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE household_id = ? AND id IN (${placeholders})
  `).get(householdId, ...ids);
  return result.count === ids.length;
}

function projectBelongsToHousehold(projectId, householdId) {
  if (projectId === undefined || projectId === null || projectId === '') return true;
  const id = Number(projectId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  return !!db.prepare('SELECT 1 FROM projects WHERE id = ? AND household_id = ?').get(id, householdId);
}

function challengeParticipantsBelongToHousehold(participants, householdId) {
  if (!Array.isArray(participants) || participants.length === 0) return false;
  const emails = participants.map((participant) => {
    const email = String(participant?.email || '').trim().toLowerCase();
    const id = String(participant?.id || '').trim().toLowerCase();
    return email && id === email ? email : null;
  });
  if (emails.some((email) => !email) || new Set(emails).size !== emails.length) return false;
  const placeholders = emails.map(() => '?').join(', ');
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE household_id = ? AND LOWER(email) IN (${placeholders})
  `).get(householdId, ...emails);
  return result.count === emails.length;
}

// Auth routes
app.post('/api/auth/register', (req, res) => {
  const existingUser = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (!ALLOW_REGISTRATION || existingUser) {
    return res.status(403).json({
      error: 'Household registration is closed. Ask the head of your household for an invite.',
    });
  }

  try {
    const { name, email, password, color, household_name } = req.body ?? {};
    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedHouseholdName = household_name?.trim();

    if (!trimmedName || !trimmedEmail || !password || !trimmedHouseholdName) {
      return res.status(400).json({ error: 'Name, email, password, and household name required' });
    }

    const password_hash = hashPassword(password);
    const householdResult = db.prepare('INSERT INTO households (name) VALUES (?)').run(trimmedHouseholdName);
    const householdId = householdResult.lastInsertRowid;

    let result;
    try {
      result = db.prepare(`
        INSERT INTO users (name, email, password_hash, color, household_id, role)
        VALUES (?, ?, ?, ?, ?, 'head')
      `).run(trimmedName, trimmedEmail, password_hash, color || '#6366f1', householdId);
    } catch (err) {
      // Don't leave an empty household behind if the user insert fails.
      db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
      throw err;
    }

    db.prepare('UPDATE households SET head_user_id = ? WHERE id = ?').run(result.lastInsertRowid, householdId);

    const user = db.prepare(`${USER_WITH_HOUSEHOLD_SELECT} WHERE u.id = ?`).get(result.lastInsertRowid);
    db.prepare('UPDATE projects SET household_id = ? WHERE household_id IS NULL').run(householdId);
    db.prepare('UPDATE tasks SET household_id = ? WHERE household_id IS NULL').run(householdId);
    db.prepare('UPDATE challenges SET household_id = ? WHERE household_id IS NULL').run(householdId);
    res.json({ user: toPublicUser(user), token: createToken(user) });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare(`
    SELECT u.*, h.name as household_name
    FROM users u
    LEFT JOIN households h ON h.id = u.household_id
    WHERE u.email = ?
  `).get(email.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const safeUserObj = toPublicUser(user);
  res.json({ user: safeUserObj, token: createToken(safeUserObj) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

app.patch('/api/auth/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    typeof confirmPassword !== 'string' ||
    !currentPassword ||
    !newPassword ||
    !confirmPassword
  ) {
    return res.status(400).json({ error: 'Complete all password fields' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  const user = db.prepare('SELECT password_hash as passwordHash FROM users WHERE id = ?').get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPassword(newPassword),
    req.user.id,
  );
  res.json({ success: true });
});

app.patch('/api/auth/profile', authMiddleware, (req, res) => {
  const { name, color, avatar } = req.body ?? {};
  const updates = {};

  if (Object.hasOwn(req.body ?? {}, 'name')) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
      return res.status(400).json({ error: 'Name must be between 1 and 80 characters' });
    }
    updates.name = name.trim();
  }

  if (Object.hasOwn(req.body ?? {}, 'color')) {
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Choose a valid profile color' });
    }
    updates.color = color;
  }

  if (Object.hasOwn(req.body ?? {}, 'avatar')) {
    if (avatar !== null && (
      typeof avatar !== 'string' ||
      avatar.length > 1_500_000 ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)
    )) {
      return res.status(400).json({ error: 'Profile photo must be a PNG, JPEG, or WebP image under 1 MB' });
    }
    updates.avatar = avatar;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No profile changes provided' });
  }

  const fields = Object.keys(updates);
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${assignments} WHERE id = ?`).run(
    ...fields.map((field) => updates[field]),
    req.user.id
  );

  const user = db.prepare(`${USER_WITH_HOUSEHOLD_SELECT} WHERE u.id = ?`).get(req.user.id);
  res.json(toPublicUser(user));
});

// Users list (for assignment dropdowns), limited to the current household
app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, color, avatar, role
    FROM users
    WHERE household_id = ?
    ORDER BY CASE role WHEN 'head' THEN 0 ELSE 1 END, name
  `).all(req.user.household_id);
  res.json(users);
});

// Household details + members
app.get('/api/household', authMiddleware, (req, res) => {
  const household = db.prepare(`
    SELECT h.id, h.name, h.head_user_id, h.created_at,
      head.name as head_name, head.email as head_email
    FROM households h
    LEFT JOIN users head ON head.id = h.head_user_id
    WHERE h.id = ?
  `).get(req.user.household_id);

  if (!household) {
    return res.status(404).json({ error: 'Household not found' });
  }

  const members = db.prepare(`
    SELECT id, name, email, color, avatar, role, created_at
    FROM users
    WHERE household_id = ?
    ORDER BY CASE role WHEN 'head' THEN 0 ELSE 1 END, name
  `).all(req.user.household_id);

  res.json({ ...household, members });
});

// Head of household invites a new member (account is created with a temporary password)
app.post('/api/household/invite', authMiddleware, (req, res) => {
  if (req.user.role !== 'head') {
    return res.status(403).json({ error: 'Only the head of household can invite members' });
  }

  const { name, email, color } = req.body ?? {};
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
  if (existingUser) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const temporaryPassword = randomBytes(24).toString('base64url');
  try {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, color, household_id, role)
      VALUES (?, ?, ?, ?, ?, 'member')
    `).run(
      name.trim(),
      email.trim(),
      hashPassword(temporaryPassword),
      color || '#6366f1',
      req.user.household_id
    );

    const user = db.prepare(`${USER_WITH_HOUSEHOLD_SELECT} WHERE u.id = ?`).get(result.lastInsertRowid);
    res.status(201).json({
      user: toPublicUser(user),
      temporaryPassword,
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

// Projects
app.get('/api/projects', authMiddleware, (req, res) => {
  const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';

  const projects = db.prepare(`
    SELECT p.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.household_id = p.household_id AND t.is_personal = 0) as task_count
    FROM projects p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.household_id = ? AND (? = 1 OR p.is_archived = 0)
    ORDER BY p.is_archived ASC, p.created_at DESC
  `).all(req.user.household_id, includeArchived ? 1 : 0);

  res.json(projects.map((project) => ({
    ...project,
    is_archived: !!project.is_archived,
  })));
});

app.post('/api/projects', authMiddleware, (req, res) => {
  const { name, description } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO projects (household_id, name, description, created_by)
    VALUES (?, ?, ?, ?)
  `).run(req.user.household_id, name.trim(), description?.trim() || null, req.user.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...project, is_archived: !!project.is_archived });
});

app.patch('/api/projects/:id/archive', authMiddleware, (req, res) => {
  const { id } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare(`
    UPDATE projects
    SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
    WHERE id = ? AND household_id = ?
  `).run(id, req.user.household_id);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  res.json({ ...updated, is_archived: !!updated.is_archived });
});

app.patch('/api/projects/:id/restore', authMiddleware, (req, res) => {
  const { id } = req.params;
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare(`
    UPDATE projects
    SET is_archived = 0, archived_at = NULL
    WHERE id = ? AND household_id = ?
  `).run(id, req.user.household_id);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  res.json({ ...updated, is_archived: !!updated.is_archived });
});

app.delete('/api/projects/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare('DELETE FROM projects WHERE id = ? AND household_id = ?').run(id, req.user.household_id);
  res.status(204).send();
});

// Tasks CRUD
app.get('/api/tasks', authMiddleware, (req, res) => {
  const { type, assigned_to, project_id } = req.query;

  const params = [req.user.household_id];
  let sql = `
    SELECT t.*, p.name as project_name,
      (SELECT json_group_array(ta.user_id) FROM task_assignments ta
       JOIN users assigned_user ON assigned_user.id = ta.user_id
       WHERE ta.task_id = t.id AND assigned_user.household_id = t.household_id) as assigned_user_ids
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.household_id = t.household_id
    WHERE t.is_personal = 0 AND t.household_id = ?
  `;

  if (type && VALID_TASK_TYPES.has(type)) {
    sql += ' AND t.task_type = ?';
    params.push(type);
  }

  if (project_id) {
    const pid = Number(project_id);
    if (!Number.isNaN(pid)) {
      sql += ' AND t.project_id = ?';
      params.push(pid);
    }
  }

  sql += `
    ORDER BY CASE t.workflow_status
      WHEN 'backlog' THEN 0
      WHEN 'todo' THEN 1
      WHEN 'in_progress' THEN 2
      WHEN 'done' THEN 3
      ELSE 4 END, t.task_type, t.title
  `;

  const tasks = db.prepare(sql).all(...params).map((t) => ({
    ...t,
    assigned_user_ids: t.assigned_user_ids ? JSON.parse(t.assigned_user_ids) : [],
    is_group_task: !!t.is_group_task,
    is_all_day: t.is_all_day !== 0,
    is_personal: !!t.is_personal,
  }));

  if (!assigned_to) {
    return res.json(tasks);
  }

  if (assigned_to === 'unassigned') {
    return res.json(tasks.filter((t) => !t.assigned_user_ids?.length));
  }

  const uid = Number(assigned_to);
  if (Number.isNaN(uid)) {
    return res.status(400).json({ error: 'assigned_to must be a valid user id or "unassigned"' });
  }

  return res.json(tasks.filter((t) => t.assigned_user_ids?.includes(uid)));
});

app.post('/api/tasks', authMiddleware, (req, res) => {
  const {
    title, description, task_type, recurrence_pattern, default_stars,
    is_group_task, group_id, due_date, start_time, end_time, is_all_day, is_personal, assigned_user_ids,
    project_id, workflow_status
  } = req.body;

  const normalizedTaskType = task_type || 'daily';
  const normalizedWorkflowStatus = workflow_status || 'backlog';

  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!VALID_TASK_TYPES.has(normalizedTaskType)) return res.status(400).json({ error: 'invalid task_type' });
  if (!WORKFLOW_STATUSES.has(normalizedWorkflowStatus)) return res.status(400).json({ error: 'invalid workflow_status' });
  if (assigned_user_ids !== undefined && !usersBelongToHousehold(assigned_user_ids, req.user.household_id)) {
    return res.status(400).json({ error: 'assigned_user_ids must contain only household members' });
  }
  if (!projectBelongsToHousehold(project_id, req.user.household_id)) {
    return res.status(400).json({ error: 'project_id must belong to your household' });
  }

  const result = db.prepare(`
    INSERT INTO tasks (household_id, title, description, task_type, recurrence_pattern, default_stars, is_group_task, group_id, due_date, start_time, end_time, is_all_day, is_personal, created_by, project_id, workflow_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.household_id,
    title,
    description || null,
    normalizedTaskType,
    recurrence_pattern || null,
    default_stars ?? 1,
    is_group_task ? 1 : 0,
    group_id || null,
    due_date || null,
    start_time || null,
    end_time || null,
    is_all_day !== false ? 1 : 0,
    is_personal ? 1 : 0,
    req.user.id,
    project_id || null,
    normalizedWorkflowStatus
  );

  const taskId = result.lastInsertRowid;

  if (assigned_user_ids?.length) {
    const insert = db.prepare('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)');
    for (const uid of assigned_user_ids) {
      insert.run(taskId, uid);
    }
  }

  const task = db.prepare(`
    SELECT t.*, p.name as project_name,
      (SELECT json_group_array(ta.user_id) FROM task_assignments ta
       JOIN users assigned_user ON assigned_user.id = ta.user_id
       WHERE ta.task_id = t.id AND assigned_user.household_id = t.household_id) as assigned_user_ids
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.household_id = t.household_id
    WHERE t.id = ?
  `).get(taskId);
  task.assigned_user_ids = task.assigned_user_ids ? JSON.parse(task.assigned_user_ids) : [];
  task.is_group_task = !!task.is_group_task;
  task.is_all_day = task.is_all_day !== 0;
  task.is_personal = !!task.is_personal;

  res.status(201).json(task);
});

app.patch('/api/tasks/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  const {
    title,
    description,
    task_type,
    recurrence_pattern,
    default_stars,
    is_group_task,
    group_id,
    due_date,
    start_time,
    end_time,
    is_all_day,
    is_personal,
    assigned_user_ids,
    project_id,
    workflow_status
  } = req.body;

  const task = db.prepare('SELECT id, project_id FROM tasks WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (task_type && !VALID_TASK_TYPES.has(task_type)) return res.status(400).json({ error: 'invalid task_type' });
  if (workflow_status && !WORKFLOW_STATUSES.has(workflow_status)) return res.status(400).json({ error: 'invalid workflow_status' });
  if (assigned_user_ids !== undefined && !usersBelongToHousehold(assigned_user_ids, req.user.household_id)) {
    return res.status(400).json({ error: 'assigned_user_ids must contain only household members' });
  }
  const nextProjectId = project_id === undefined ? task.project_id : project_id;
  if (!projectBelongsToHousehold(nextProjectId, req.user.household_id)) {
    return res.status(400).json({ error: 'project_id must belong to your household' });
  }

  const safe = (v) => (v === undefined ? null : v);

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      task_type = COALESCE(?, task_type),
      recurrence_pattern = COALESCE(?, recurrence_pattern),
      default_stars = COALESCE(?, default_stars),
      is_group_task = COALESCE(?, is_group_task),
      group_id = COALESCE(?, group_id),
      due_date = ?,
      start_time = ?,
      end_time = ?,
      is_all_day = COALESCE(?, is_all_day),
      is_personal = COALESCE(?, is_personal),
      project_id = ?,
      workflow_status = COALESCE(?, workflow_status)
    WHERE id = ? AND household_id = ?
  `).run(
    safe(title),
    safe(description),
    safe(task_type),
    safe(recurrence_pattern),
    safe(default_stars),
    is_group_task !== undefined ? (is_group_task ? 1 : 0) : null,
    safe(group_id),
    safe(due_date),
    safe(start_time),
    safe(end_time),
    is_all_day !== undefined ? (is_all_day ? 1 : 0) : null,
    is_personal !== undefined ? (is_personal ? 1 : 0) : null,
    nextProjectId || null,
    safe(workflow_status),
    id,
    req.user.household_id
  );

  if (assigned_user_ids !== undefined) {
    db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(id);
    if (assigned_user_ids?.length) {
      const insert = db.prepare(
        'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)'
      );
      for (const uid of assigned_user_ids) insert.run(id, uid);
    }
  }

  res.json({ success: true });
});


app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND household_id = ?').run(req.params.id, req.user.household_id);
  res.status(204).send();
});

// Task completions
app.get('/api/completions', authMiddleware, (req, res) => {
  const { task_id, user_id, start_date, end_date } = req.query;
  let sql = `
    SELECT tc.*, t.title as task_title, t.task_type, u.name as user_name, u.color as user_color
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE t.is_personal = 0 AND t.household_id = ?
      AND (tc.user_id IS NULL OR u.household_id = ?)
  `;
  const params = [req.user.household_id, req.user.household_id];
  if (task_id) { sql += ' AND tc.task_id = ?'; params.push(task_id); }
  if (user_id) { sql += ' AND tc.user_id = ?'; params.push(user_id); }
  if (start_date) { sql += ' AND datetime(tc.completed_at) >= datetime(?)'; params.push(start_date); }
  if (end_date) { sql += ' AND datetime(tc.completed_at) <= datetime(?)'; params.push(end_date); }
  sql += ' ORDER BY tc.completed_at DESC';

  const completions = db.prepare(sql).all(...params);
  res.json(completions);
});

// Task completions - batch support
app.post('/api/completions', authMiddleware, (req, res) => {
  let { task_id, user_id, user_ids, stars_earned, notes } = req.body;

  if (!task_id) return res.status(400).json({ error: 'task_id is required' });

  const task = db.prepare(`
    SELECT id, default_stars FROM tasks
    WHERE id = ? AND household_id = ? AND is_personal = 0
  `).get(task_id, req.user.household_id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Normalize to array of user IDs
  let idsToComplete = [];
  if (Array.isArray(user_ids) && user_ids.length > 0) {
    idsToComplete = user_ids;
  } else if (user_id) {
    idsToComplete = [user_id];
  } else {
    idsToComplete = [req.user.id]; // default to current user
  }

  // Filter out invalid/undefined IDs
  idsToComplete = idsToComplete.filter((id) => id != null);
  if (idsToComplete.length === 0) {
    return res.status(400).json({ error: 'No valid user IDs provided' });
  }
  if (!usersBelongToHousehold(idsToComplete, req.user.household_id)) {
    return res.status(400).json({ error: 'user_ids must contain only household members' });
  }

  const starsToUse = stars_earned ?? task.default_stars;
  const notesToUse = notes || null;

  const insertStmt = db.prepare(`
    INSERT INTO task_completions (task_id, user_id, stars_earned, notes)
    VALUES (?, ?, ?, ?)
  `);

  const insertedCompletions = idsToComplete.map((uid) => {
    const result = insertStmt.run(task.id, uid, starsToUse, notesToUse);
    return db.prepare(`
      SELECT tc.*, t.title as task_title, u.name as user_name, u.color as user_color
      FROM task_completions tc
      JOIN tasks t ON t.id = tc.task_id
      LEFT JOIN users u ON u.id = tc.user_id
      WHERE tc.id = ?
    `).get(result.lastInsertRowid);
  });

  res.status(201).json(insertedCompletions);
});


// Delete task completed OR Mark Undone
app.delete('/api/completions/:id', authMiddleware, (req, res) => {
  db.prepare(`
    DELETE FROM task_completions
    WHERE id = ? AND task_id IN (
      SELECT id FROM tasks WHERE household_id = ?
    ) AND (user_id IS NULL OR user_id IN (
      SELECT id FROM users WHERE household_id = ?
    ))
  `).run(req.params.id, req.user.household_id, req.user.household_id);
  res.status(204).send();
});

// Ensure tables for storing Google OAuth tokens and imported events exist
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS google_tokens (
    user_id INTEGER PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS google_imports (
    gcal_id TEXT PRIMARY KEY,
    task_id INTEGER,
    imported_at INTEGER
  )`).run();
} catch (err) {
  console.error('Failed to ensure google integration tables', err);
}

// Route to report whether Google integration is configured
app.get('/api/integrations/google/status', authMiddleware, (req, res) => {
  res.json({ enabled: GOOGLE_ENABLED });
});

// Route to create Google OAuth connect URL
app.get('/api/integrations/google/connect', authMiddleware, (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(404).json({ error: 'google_not_configured' });
  const redirectUri = `${process.env.SERVER_ORIGIN}/api/integrations/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url });
});

// OAuth2 callback to exchange code for tokens and store them
app.get('/api/integrations/google/callback', authMiddleware, async (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(404).send('Not configured');
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  const redirectUri = `${process.env.SERVER_ORIGIN}/api/integrations/google/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      console.error('google token exchange failed', tokenJson);
      return res.status(500).send('Failed to exchange token');
    }

    db.prepare(`INSERT OR REPLACE INTO google_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)`)
      .run(req.user.id, tokenJson.access_token, tokenJson.refresh_token || null, tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : null);

    // Close the popup if opened from client, otherwise return success
    return res.send('<html><body><script>window.close();</script><p>Connected to Google Calendar. You can close this window.</p></body></html>');
  } catch (err) {
    console.error('google callback error', err);
    return res.status(500).send('Google callback failed');
  }
});

// Import Google Calendar events into local tasks (one-way import)
app.post('/api/integrations/google/import', authMiddleware, async (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(404).json({ error: 'google_not_configured' });
  const { start, end, calendarId = 'primary' } = req.query;
  const rangeStart = start?.slice(0, 10) || formatYmd(new Date());
  const rangeEnd = end?.slice(0, 10) || formatYmd(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const tokenRow = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.user.id);
  if (!tokenRow || !tokenRow.access_token) return res.status(400).json({ error: 'Google not connected' });

  let accessToken = tokenRow.access_token;
  // refresh if expired
  if (tokenRow.expires_at && Number(tokenRow.expires_at) <= Date.now()) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: tokenRow.refresh_token,
        }),
      });
      const refreshJson = await refreshRes.json();
      if (refreshJson.access_token) {
        accessToken = refreshJson.access_token;
        db.prepare('UPDATE google_tokens SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ? WHERE user_id = ?')
          .run(accessToken, refreshJson.refresh_token || tokenRow.refresh_token, refreshJson.expires_in ? Date.now() + refreshJson.expires_in * 1000 : null, req.user.id);
      }
    } catch (err) {
      console.error('Failed to refresh Google access token', err);
    }
  }

  try {
    const timeMin = `${rangeStart}T00:00:00Z`;
    const timeMax = `${rangeEnd}T23:59:59Z`;
    const gres = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const gjson = await gres.json();
    if (!Array.isArray(gjson.items)) return res.json({ imported: [] });

    const created = [];
    const insertTask = db.prepare(`
      INSERT INTO tasks (household_id, title, description, task_type, recurrence_pattern, default_stars, is_group_task, group_id, due_date, start_time, end_time, is_all_day, is_personal, created_by, project_id, workflow_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMap = db.prepare('INSERT OR REPLACE INTO google_imports (gcal_id, task_id, imported_at) VALUES (?, ?, ?)');

    for (const it of gjson.items) {
      if (it.status === 'cancelled') continue;
      const gId = it.id;
      const existing = db.prepare('SELECT task_id FROM google_imports WHERE gcal_id = ?').get(gId);
      if (existing) continue; // already imported

      const startVal = it.start?.dateTime || it.start?.date; // date or dateTime
      const endVal = it.end?.dateTime || it.end?.date;
      const startDate = new Date(startVal);
      const dueDate = formatYmd(startDate);
      let startTime = null;
      let endTime = null;
      const allDay = !!it.start?.date;
      if (!allDay && it.start?.dateTime) startTime = new Date(it.start.dateTime).toISOString().slice(11,16);
      if (!allDay && it.end?.dateTime) endTime = new Date(it.end.dateTime).toISOString().slice(11,16);

      const result = insertTask.run(
        req.user.household_id,
        it.summary || '(no title)',
        it.description || null,
        'event',
        null,
        1,
        0,
        null,
        dueDate,
        startTime,
        endTime,
        allDay ? 1 : 0,
        0,
        req.user.id,
        null,
        'backlog'
      );

      const taskId = result.lastInsertRowid;
      insertMap.run(gId, taskId, Date.now());
      const task = db.prepare('SELECT id, title, due_date, start_time, end_time, is_all_day FROM tasks WHERE id = ?').get(taskId);
      created.push(task);
    }

    res.json({ imported: created });
  } catch (err) {
    console.error('Failed to import Google events', err);
    return res.status(500).json({ error: 'import_failed' });
  }
});

function getSunday(dateInput = new Date()) {
  const date = (() => {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [year, month, day] = dateInput.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(dateInput);
  })();
  const day = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - day);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function formatYmd(date) {
  const d = new Date(date);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function getWeekDays(weekStart) {
  const start = getSunday(weekStart);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatYmd(d);
  });
}

function buildTrackerOverview(days, tasks, habits, habitLogs) {
  const habitCompletionByKey = new Map();
  for (const log of habitLogs) {
    habitCompletionByKey.set(`${log.habit_id}-${log.date}`, !!log.completed);
  }

  const daily = days.map((date) => {
    const tasksForDay = tasks.filter((task) => task.due_date === date);
    const totalTasks = tasksForDay.length;
    const completedTasks = tasksForDay.filter((task) => !!task.completed).length;

    const totalHabits = habits.length;
    const completedHabits = habits.filter((habit) => habitCompletionByKey.get(`${habit.id}-${date}`)).length;

    const total = totalTasks + totalHabits;
    const completed = completedTasks + completedHabits;
    const percent = total ? (completed / total) * 100 : 0;

    return {
      date,
      completedTasks,
      totalTasks,
      completedHabits,
      totalHabits,
      completed,
      total,
      percent,
    };
  });

  const weekly = daily.reduce(
    (acc, day) => ({
      completedTasks: acc.completedTasks + day.completedTasks,
      totalTasks: acc.totalTasks + day.totalTasks,
      completedHabits: acc.completedHabits + day.completedHabits,
      totalHabits: acc.totalHabits + day.totalHabits,
      completed: acc.completed + day.completed,
      total: acc.total + day.total,
    }),
    { completedTasks: 0, totalTasks: 0, completedHabits: 0, totalHabits: 0, completed: 0, total: 0 }
  );

  return {
    daily,
    weekly: {
      ...weekly,
      percent: weekly.total ? (weekly.completed / weekly.total) * 100 : 0,
    },
  };
}

// Personal tracker
app.get('/api/tracker/weekly', authMiddleware, (req, res) => {
  const weekStart = req.query.week_start || formatYmd(getSunday());
  const days = getWeekDays(weekStart);
  const weekEnd = days[6];

  const weeklyTasks = db.prepare(`
    SELECT t.id, t.title, t.due_date,
      EXISTS(
        SELECT 1 FROM task_completions tc
        WHERE tc.task_id = t.id
          AND tc.user_id = ?
          AND date(tc.completed_at) = t.due_date
      ) as completed
    FROM tasks t
    WHERE t.created_by = ?
      AND t.task_type = 'one-time'
      AND t.is_personal = 1
      AND t.due_date BETWEEN ? AND ?
    ORDER BY t.due_date, t.created_at
  `).all(req.user.id, req.user.id, weekStart, weekEnd).map((t) => ({ ...t, completed: !!t.completed }));

  const habits = db.prepare(`
    SELECT id, name, created_at, updated_at
    FROM habits
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id);

  const habitLogs = db.prepare(`
    SELECT MIN(hl.id) as id, hl.habit_id, hl.date, MAX(hl.completed) as completed
    FROM habit_logs hl
    JOIN habits h ON h.id = hl.habit_id
    WHERE h.user_id = ?
      AND hl.date BETWEEN ? AND ?
    GROUP BY hl.habit_id, hl.date
  `).all(req.user.id, weekStart, weekEnd).map((log) => ({ ...log, completed: !!log.completed }));

  const overview = buildTrackerOverview(days, weeklyTasks, habits, habitLogs);

  res.json({ weekStart, weekEnd, days, tasks: weeklyTasks, habits, habitLogs, overview });
});

app.post('/api/tracker/tasks', authMiddleware, (req, res) => {
  const { title, due_date } = req.body;
  if (!title || !due_date) return res.status(400).json({ error: 'title and due_date are required' });

  const result = db.prepare(`
    INSERT INTO tasks (household_id, title, task_type, recurrence_pattern, due_date, created_by, is_all_day, is_personal)
    VALUES (?, ?, 'one-time', 'personal_tracker', ?, ?, 1, 1)
  `).run(req.user.household_id, title, due_date, req.user.id);

  const task = db.prepare('SELECT id, title, due_date FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

app.patch('/api/tracker/tasks/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, due_date } = req.body;
  const task = db.prepare(`
    SELECT id FROM tasks
    WHERE id = ? AND created_by = ? AND is_personal = 1
  `).get(id, req.user.id);

  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      due_date = COALESCE(?, due_date)
    WHERE id = ?
  `).run(title ?? null, due_date ?? null, id);

  res.json({ success: true });
});

app.delete('/api/tracker/tasks/:id', authMiddleware, (req, res) => {
  const result = db.prepare(`
    DELETE FROM tasks
    WHERE id = ? AND created_by = ? AND is_personal = 1
  `).run(req.params.id, req.user.id);

  if (!result.changes) return res.status(404).json({ error: 'Task not found' });
  res.status(204).send();
});

app.patch('/api/tracker/tasks/:id/toggle', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { completed, date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const task = db.prepare(`
    SELECT id, due_date, default_stars FROM tasks
    WHERE id = ? AND created_by = ? AND is_personal = 1
  `).get(id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (completed) {
    const existing = db.prepare(`
      SELECT id FROM task_completions
      WHERE task_id = ? AND date(completed_at) = ?
        AND user_id = ?
      LIMIT 1
    `).get(id, date, req.user.id);

    if (!existing) {
      db.prepare(`
        INSERT INTO task_completions (task_id, user_id, completed_at, stars_earned)
        VALUES (?, ?, datetime(? || 'T12:00:00Z'), ?)
      `).run(id, req.user.id, date, task.default_stars ?? 1);
    }
  } else {
    db.prepare(`
      DELETE FROM task_completions
      WHERE task_id = ? AND date(completed_at) = ?
        AND user_id = ?
    `).run(id, date, req.user.id);
  }

  res.json({ success: true });
});

app.post('/api/tracker/habits', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO habits (user_id, name)
    VALUES (?, ?)
  `).run(req.user.id, name);

  const habit = db.prepare('SELECT id, name FROM habits WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(habit);
});

app.patch('/api/tracker/habits/:id', authMiddleware, (req, res) => {
  const { name } = req.body;
  const result = db.prepare(`
    UPDATE habits
    SET name = COALESCE(?, name), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(name ?? null, req.params.id, req.user.id);

  if (!result.changes) return res.status(404).json({ error: 'Habit not found' });
  res.json({ success: true });
});

app.delete('/api/tracker/habits/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM habits WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Habit not found' });
  res.status(204).send();
});

app.patch('/api/tracker/habits/:id/toggle', authMiddleware, (req, res) => {
  const { date, completed } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const habit = db.prepare('SELECT id FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });

  const value = completed ? 1 : 0;

  // Backward-compatible upsert for older databases that may not have
  // a UNIQUE(habit_id, date) constraint in habit_logs.
  const updated = db.prepare(`
    UPDATE habit_logs
    SET completed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE habit_id = ? AND date = ?
  `).run(value, req.params.id, date);

  if (!updated.changes) {
    db.prepare(`
      INSERT INTO habit_logs (habit_id, date, completed)
      VALUES (?, ?, ?)
    `).run(req.params.id, date, value);
  }

  res.json({ success: true });
});

// Task completions - batch update
app.patch('/api/completions', authMiddleware, (req, res) => {
  let { updates, task_id } = req.body; 
  if (!updates) updates = [];
  if (!Array.isArray(updates)) updates = [updates];

  if (!task_id) return res.status(400).json({ error: 'task_id is required' });
  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND household_id = ? AND is_personal = 0')
    .get(task_id, req.user.household_id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const updatedCompletions = [];

  const selectStmt = db.prepare(`
    SELECT tc.*, t.title as task_title, u.name as user_name, u.color as user_color
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE tc.id = ? AND tc.task_id = ? AND t.household_id = ?
      AND (tc.user_id IS NULL OR u.household_id = ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE task_completions
    SET stars_earned = COALESCE(?, stars_earned),
        notes = COALESCE(?, notes)
    WHERE id = ? AND task_id = ?
  `);

  for (const upd of updates) {
    const existing = selectStmt.get(upd.id, task.id, req.user.household_id, req.user.household_id);
    if (!existing) continue;

    updateStmt.run(
      upd.stars_earned ?? null,
      upd.notes ?? null,
      upd.id,
      task.id
    );

    const updated = selectStmt.get(upd.id, task.id, req.user.household_id, req.user.household_id);
    updatedCompletions.push(updated);
  }

  // Return all completions for this task
  const finalCompletions = db.prepare(`
    SELECT tc.*, t.title as task_title, u.name as user_name, u.color as user_color
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE tc.task_id = ? AND t.household_id = ?
      AND (tc.user_id IS NULL OR u.household_id = ?)
  `).all(task.id, req.user.household_id, req.user.household_id);

  res.json(finalCompletions);
});




function loadChallengeTrackerState(userId, userEmail, householdId, challengeIdOverride) {
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  let challenge;

  const selectedChallengeId = challengeIdOverride || pickBestChallengeId(userId, userEmail, householdId);

  if (selectedChallengeId) {
    challenge = db.prepare(`
      SELECT c.id, c.title, c.start_date as startDate, c.end_date as endDate, c.publish_date as publishDate,
        c.metrics_json as metricsJson
      FROM challenges c
      WHERE c.id = ?
        AND c.household_id = ?
        AND (
          c.created_by = ? OR EXISTS (
            SELECT 1 FROM challenge_participants cp
            WHERE cp.challenge_id = c.id AND LOWER(cp.participant_key) = ?
          )
        )
      LIMIT 1
    `).get(selectedChallengeId, householdId, userId, normalizedEmail);
  }

  if (!challenge) return null;

  const participants = db.prepare(`
    SELECT cp.participant_key as id, cp.participant_key as email, cp.name, cp.color, cp.text_class as text
    FROM challenge_participants cp
    JOIN users u ON LOWER(u.email) = LOWER(cp.participant_key) AND u.household_id = ?
    WHERE cp.challenge_id = ?
    ORDER BY display_order, participant_key
  `).all(householdId, challenge.id);

  const goalRows = db.prepare(`
    SELECT participant_key as participantKey, max_calories as maxCalories, workout_minutes as workoutMinutes,
      min_steps as minSteps, protein_grams as proteinGrams, water_liters as waterLiters,
      custom_goals_json as customGoalsJson
    FROM challenge_goals cg
    WHERE cg.challenge_id = ? AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.household_id = ? AND LOWER(u.email) = LOWER(cg.participant_key)
    )
  `).all(challenge.id, householdId);

  const goals = {};
  for (const row of goalRows) {
    goals[row.participantKey] = {
      maxCalories: row.maxCalories,
      workoutMinutes: row.workoutMinutes,
      minSteps: row.minSteps,
      proteinGrams: row.proteinGrams,
      waterLiters: row.waterLiters,
      ...(JSON.parse(row.customGoalsJson || '{}')),
    };
  }

  const entryRows = db.prepare(`
    SELECT entry_date as entryDate, participant_key as participantKey, calories, workout_minutes as workoutMinutes,
      steps, protein_grams as proteinGrams, water_liters as waterLiters, healthy_bonus as healthyBonus, sleep_hours as sleepHours,
      custom_values_json as customValuesJson
    FROM challenge_daily_entries cde
    WHERE cde.challenge_id = ? AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.household_id = ? AND LOWER(u.email) = LOWER(cde.participant_key)
    )
  `).all(challenge.id, householdId);

  const scores = {};
  for (const row of entryRows) {
    if (!scores[row.entryDate]) scores[row.entryDate] = {};
    scores[row.entryDate][row.participantKey] = {
      calories: row.calories,
      workoutMinutes: row.workoutMinutes,
      steps: row.steps,
      proteinGrams: row.proteinGrams,
      waterLiters: row.waterLiters,
      healthyBonus: !!row.healthyBonus,
      sleepHours: row.sleepHours,
      ...JSON.parse(row.customValuesJson || '{}'),
    };
  }

  return {
    challengeId: challenge.id,
    challenge: { ...challenge, metrics: JSON.parse(challenge.metricsJson || 'null') },
    participants,
    goals,
    scores,
  };
}

function findAccessibleChallengeIds(userId, userEmail, householdId) {
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  return db.prepare(`
    SELECT DISTINCT c.id
    FROM challenges c
    LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id
    WHERE c.household_id = ? AND (c.created_by = ? OR LOWER(cp.participant_key) = ?)
    ORDER BY c.id DESC
  `).all(householdId, userId, normalizedEmail).map((row) => row.id);
}

function pickBestChallengeId(userId, userEmail, householdId, preferredChallengeId = null) {
  const ids = findAccessibleChallengeIds(userId, userEmail, householdId);
  if (!ids.length) return null;

  if (preferredChallengeId && ids.includes(Number(preferredChallengeId))) {
    return Number(preferredChallengeId);
  }

  const candidates = ids.map((id) => {
    const entryCount = db.prepare('SELECT COUNT(*) as count FROM challenge_daily_entries WHERE challenge_id = ?').get(id)?.count || 0;
    const goalCount = db.prepare('SELECT COUNT(*) as count FROM challenge_goals WHERE challenge_id = ?').get(id)?.count || 0;
    const participantCount = db.prepare('SELECT COUNT(*) as count FROM challenge_participants WHERE challenge_id = ?').get(id)?.count || 0;
    return { id, score: entryCount + goalCount + participantCount };
  });

  candidates.sort((a, b) => b.score - a.score || b.id - a.id);
  return candidates[0]?.id ?? null;
}

function saveChallengeConfig(userId, userEmail, householdId, { challenge, participants, goals, metrics, challengeId: explicitChallengeId }) {
  const metricsJson = Array.isArray(metrics) ? JSON.stringify(metrics) : null;
  const normalizedParticipants = (participants || []).map((participant, index) => {
    const rawId = participant?.id || participant?.email || `participant-${index + 1}`;
    const participantId = String(rawId).trim().toLowerCase();
    const email = String(participant?.email || participantId).trim().toLowerCase();
    return {
      id: participantId,
      email,
      name: String(participant?.name || email || 'Participant').trim(),
      color: participant?.color || '#6366f1',
      text: participant?.text || 'text-slate-700',
    };
  });

  const normalizedGoals = {};
  for (const participant of normalizedParticipants) {
    const goal = goals?.[participant.id] || goals?.[participant.email] || {};
    normalizedGoals[participant.id] = {
      maxCalories: Number(goal.maxCalories ?? 0),
      workoutMinutes: Number(goal.workoutMinutes ?? 0),
      minSteps: Number(goal.minSteps ?? 0),
      proteinGrams: Number(goal.proteinGrams ?? 0),
      waterLiters: Number(goal.waterLiters ?? 0),
      customGoals: Object.fromEntries(Object.entries(goal).filter(([key]) => (
        !['maxCalories', 'workoutMinutes', 'minSteps', 'proteinGrams', 'waterLiters'].includes(key)
      )).map(([key, value]) => [key, Number(value) || 0])),
    };
  }

  let challengeId = explicitChallengeId === undefined
    ? pickBestChallengeId(userId, userEmail, householdId)
    : (explicitChallengeId ? Number(explicitChallengeId) : null);

  if (challengeId) {
    db.prepare(`
      UPDATE challenges
      SET title = ?, start_date = ?, end_date = ?, publish_date = ?, metrics_json = COALESCE(?, metrics_json), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND household_id = ?
    `).run(challenge.title, challenge.startDate, challenge.endDate, challenge.publishDate, metricsJson, challengeId, householdId);
    db.prepare('DELETE FROM challenge_participants WHERE challenge_id = ?').run(challengeId);
    db.prepare('DELETE FROM challenge_goals WHERE challenge_id = ?').run(challengeId);
  } else {
    const result = db.prepare(`
      INSERT INTO challenges (household_id, title, start_date, end_date, publish_date, metrics_json, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(householdId, challenge.title, challenge.startDate, challenge.endDate, challenge.publishDate, metricsJson, userId);
    challengeId = result.lastInsertRowid;
  }

  const insertParticipant = db.prepare(`
    INSERT INTO challenge_participants (challenge_id, participant_key, name, color, text_class, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  normalizedParticipants.forEach((participant, index) => {
    insertParticipant.run(challengeId, participant.id, participant.name, participant.color, participant.text, index);
  });

  const insertGoal = db.prepare(`
    INSERT INTO challenge_goals (challenge_id, participant_key, max_calories, workout_minutes, min_steps, protein_grams, water_liters, custom_goals_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const participant of normalizedParticipants) {
    const goal = normalizedGoals[participant.id] || {};
    insertGoal.run(
      challengeId,
      participant.id,
      goal.maxCalories ?? 0,
      goal.workoutMinutes ?? 0,
      goal.minSteps ?? 0,
      goal.proteinGrams ?? 0,
      goal.waterLiters ?? 0,
      JSON.stringify(goal.customGoals || {}),
    );
  }

  return challengeId;
}

function listChallengeTrackerChallenges(userId, userEmail, householdId) {
  const normalizedEmail = (userEmail || '').trim().toLowerCase();
  const challenges = db.prepare(`
    SELECT DISTINCT c.id, c.title, c.start_date as startDate, c.end_date as endDate, c.publish_date as publishDate
    FROM challenges c
    LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id
    WHERE c.household_id = ? AND (c.created_by = ? OR LOWER(cp.participant_key) = ?)
    ORDER BY c.start_date DESC, c.id DESC
  `).all(householdId, userId, normalizedEmail);

  const normalized = challenges.map((challenge) => {
    const participants = db.prepare(`
      SELECT cp.participant_key as id, cp.participant_key as email, cp.name, cp.color, cp.text_class as text
      FROM challenge_participants cp
      JOIN users u ON LOWER(u.email) = LOWER(cp.participant_key) AND u.household_id = ?
      WHERE cp.challenge_id = ?
      ORDER BY cp.display_order, cp.participant_key
    `).all(householdId, challenge.id);

    return {
      ...challenge,
      participants,
      sharedWith: participants.map((participant) => participant.email || participant.name),
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    active: normalized.filter((challenge) => {
      if (!challenge.endDate) return true;
      const endDate = new Date(`${challenge.endDate}T00:00:00`);
      return endDate >= today;
    }),
    past: normalized.filter((challenge) => {
      if (!challenge.endDate) return false;
      const endDate = new Date(`${challenge.endDate}T00:00:00`);
      return endDate < today;
    }),
  };
}

app.get('/api/challenge-tracker', authMiddleware, (req, res) => {
  const state = loadChallengeTrackerState(req.user.id, req.user.email, req.user.household_id);
  if (!state) return res.status(404).json({ error: 'No saved challenge' });
  res.json(state);
});

app.get('/api/challenge-tracker/list', authMiddleware, (req, res) => {
  const challenges = listChallengeTrackerChallenges(req.user.id, req.user.email, req.user.household_id);
  res.json(challenges);
});

app.delete('/api/challenge-tracker/:id', authMiddleware, (req, res) => {
  const challengeId = Number(req.params.id);
  if (!Number.isFinite(challengeId)) {
    return res.status(400).json({ error: 'Invalid challenge id' });
  }

  const challenge = db.prepare('SELECT id, created_by FROM challenges WHERE id = ? AND household_id = ?')
    .get(challengeId, req.user.household_id);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found' });
  }

  const normalizedEmail = (req.user.email || '').trim().toLowerCase();
  const isCreator = challenge.created_by === req.user.id;
  const isParticipant = !!db.prepare(`
    SELECT 1 FROM challenge_participants
    WHERE challenge_id = ? AND LOWER(participant_key) = ?
    LIMIT 1
  `).get(challengeId, normalizedEmail);

  if (!isCreator && !isParticipant) {
    return res.status(403).json({ error: 'You do not have access to delete this challenge' });
  }

  db.prepare('DELETE FROM challenges WHERE id = ? AND household_id = ?')
    .run(challengeId, req.user.household_id);
  res.status(204).send();
});

app.get('/api/challenge-tracker/:id', authMiddleware, (req, res) => {
  const state = loadChallengeTrackerState(req.user.id, req.user.email, req.user.household_id, Number(req.params.id));
  if (!state) return res.status(404).json({ error: 'Challenge not found' });
  res.json(state);
});

app.put('/api/challenge-tracker', authMiddleware, (req, res) => {
  const { challenge, participants, goals, metrics, challengeId: existingChallengeId } = req.body;
  if (!challenge?.startDate || !challenge?.endDate || !Array.isArray(participants) || !goals) {
    return res.status(400).json({ error: 'challenge, participants, and goals are required' });
  }
  if (metrics !== undefined && !Array.isArray(metrics)) {
    return res.status(400).json({ error: 'metrics must be an array' });
  }
  if (!challengeParticipantsBelongToHousehold(participants, req.user.household_id)) {
    return res.status(400).json({ error: 'Challenge participants must be household members with matching account emails' });
  }
  if (existingChallengeId !== undefined && existingChallengeId !== null) {
    const challengeId = Number(existingChallengeId);
    if (!Number.isSafeInteger(challengeId) || challengeId <= 0) {
      return res.status(400).json({ error: 'Invalid challenge id' });
    }
    const normalizedEmail = (req.user.email || '').trim().toLowerCase();
    const authorizedChallenge = db.prepare(`
      SELECT c.id
      FROM challenges c
      LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id
      WHERE c.id = ? AND c.household_id = ?
        AND (c.created_by = ? OR LOWER(cp.participant_key) = ?)
      LIMIT 1
    `).get(challengeId, req.user.household_id, req.user.id, normalizedEmail);
    if (!authorizedChallenge) {
      return res.status(404).json({ error: 'Challenge not found or access denied' });
    }
  }

  const challengeId = saveChallengeConfig(req.user.id, req.user.email, req.user.household_id, {
    challenge, participants, goals, metrics, challengeId: existingChallengeId,
  });
  const state = loadChallengeTrackerState(req.user.id, req.user.email, req.user.household_id, challengeId);
  res.json({ ...state, challengeId });
});

app.put('/api/challenge-tracker/entries', authMiddleware, (req, res) => {
  const { date, participantId, entry, customValues, challengeId: selectedChallengeId } = req.body;
  const normalizedParticipantId = String(participantId || '').trim().toLowerCase();
  if (!date || !normalizedParticipantId || !entry) {
    return res.status(400).json({ error: 'date, participantId, and entry are required' });
  }

  const normalizedEmail = (req.user.email || '').trim().toLowerCase();
  const requestedChallengeId = selectedChallengeId ? Number(selectedChallengeId) : null;

  let challengeId = requestedChallengeId || pickBestChallengeId(req.user.id, req.user.email, req.user.household_id);
  if (challengeId) {
    const challengeAccess = db.prepare(`
      SELECT c.id
      FROM challenges c
      LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id
      WHERE c.id = ? AND c.household_id = ?
        AND (c.created_by = ? OR LOWER(cp.participant_key) = ?)
      LIMIT 1
    `).get(challengeId, req.user.household_id, req.user.id, normalizedEmail);

    if (!challengeAccess) {
      return res.status(404).json({ error: 'Challenge not found or access denied' });
    }
  }

  if (!challengeId) {
    return res.status(404).json({ error: 'Save challenge settings before logging daily entries' });
  }

  const isChallengeParticipant = db.prepare(`
    SELECT 1 FROM challenge_participants
    WHERE challenge_id = ? AND LOWER(participant_key) = ?
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.household_id = ? AND LOWER(users.email) = LOWER(challenge_participants.participant_key)
      )
  `).get(challengeId, normalizedParticipantId, req.user.household_id);
  if (!isChallengeParticipant) {
    return res.status(404).json({ error: 'Challenge participant not found' });
  }

  const existing = db.prepare(`
    SELECT id FROM challenge_daily_entries
    WHERE challenge_id = ? AND entry_date = ? AND participant_key = ?
  `).get(challengeId, date, normalizedParticipantId);
  const customValuesJson = JSON.stringify(customValues || entry.customValues || {});

  if (existing) {
    db.prepare(`
      UPDATE challenge_daily_entries
      SET calories = ?, workout_minutes = ?, steps = ?, protein_grams = ?, water_liters = ?,
        healthy_bonus = ?, sleep_hours = ?, custom_values_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      entry.calories ?? 0,
      entry.workoutMinutes ?? 0,
      entry.steps ?? 0,
      entry.proteinGrams ?? 0,
      entry.waterLiters ?? 0,
      entry.healthyBonus ? 1 : 0,
      entry.sleepHours ?? 0,
      customValuesJson,
      existing.id,
    );
  } else {
    db.prepare(`
      INSERT INTO challenge_daily_entries (
        challenge_id, entry_date, participant_key, calories, workout_minutes, steps,
        protein_grams, water_liters, healthy_bonus, sleep_hours, custom_values_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      challengeId,
      date,
      normalizedParticipantId,
      entry.calories ?? 0,
      entry.workoutMinutes ?? 0,
      entry.steps ?? 0,
      entry.proteinGrams ?? 0,
      entry.waterLiters ?? 0,
      entry.healthyBonus ? 1 : 0,
      entry.sleepHours ?? 0,
      customValuesJson,
    );
  }

  res.json({ success: true, challengeId });
});

// Insights & analytics
app.get('/api/insights/scores', authMiddleware, (req, res) => {
  const { start_date, end_date } = req.query;
  const params = [];
  const completionJoinFilters = ['tc.user_id = u.id'];
  if (start_date) {
    completionJoinFilters.push('date(tc.completed_at) >= ?');
    params.push(start_date);
  }
  if (end_date) {
    completionJoinFilters.push('date(tc.completed_at) <= ?');
    params.push(end_date);
  }

  const scores = db.prepare(`
    SELECT u.id, u.name, u.color,
      COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN tc.stars_earned ELSE 0 END), 0) as total_stars,
      COUNT(t.id) as completions_count
    FROM users u
    LEFT JOIN task_completions tc ON ${completionJoinFilters.join(' AND ')}
    LEFT JOIN tasks t ON t.id = tc.task_id AND t.is_personal = 0 AND t.household_id = u.household_id
    WHERE u.household_id = ?
    GROUP BY u.id
    ORDER BY total_stars DESC
  `).all(...params, req.user.household_id);
  res.json(scores);
});

app.get('/api/insights/task-counts', authMiddleware, (req, res) => {
  const { task_id, start_date, end_date } = req.query;
  let sql = `
    SELECT tc.user_id, u.name, u.color, t.title as task_title,
      COUNT(*) as count, SUM(tc.stars_earned) as total_stars
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE t.is_personal = 0 AND t.household_id = ?
  `;
  const params = [req.user.household_id];
  if (task_id) { sql += ' AND tc.task_id = ?'; params.push(task_id); }
  if (start_date) { sql += ' AND date(tc.completed_at) >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND date(tc.completed_at) <= ?'; params.push(end_date); }
  sql += ' AND u.household_id = t.household_id';
  sql += ' GROUP BY tc.user_id, tc.task_id ORDER BY t.title, count DESC';

  const counts = db.prepare(sql).all(...params);
  res.json(counts);
});

app.get('/api/insights/overview', authMiddleware, (req, res) => {
  const { start_date, end_date } = req.query;
  const params = [req.user.household_id];
  const filters = ['t.household_id = ?', 't.is_personal = 0'];
  if (start_date && end_date) {
    filters.push('date(tc.completed_at) BETWEEN ? AND ?');
    params.push(start_date, end_date);
  } else if (start_date) {
    filters.push('date(tc.completed_at) >= ?');
    params.push(start_date);
  } else if (end_date) {
    filters.push('date(tc.completed_at) <= ?');
    params.push(end_date);
  }
  const householdFilter = `WHERE ${filters.join(' AND ')}`;

  const totalCompletions = db.prepare(`
    SELECT COUNT(tc.id) as total
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    ${householdFilter}
  `).get(...params)?.total || 0;
  const totalStars = db.prepare(`
    SELECT COALESCE(SUM(tc.stars_earned), 0) as total
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    ${householdFilter}
  `).get(...params)?.total || 0;
  const topTasks = db.prepare(`
    SELECT t.title, t.task_type, COUNT(tc.id) as completions
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id ${householdFilter}
    GROUP BY tc.task_id
    ORDER BY completions DESC
    LIMIT 10
  `).all(...params);

  res.json({ totalCompletions: totalCompletions, totalStars, topTasks });
});

// Calendar events (combine tasks with due dates and completions for display)
app.get('/api/calendar/events', authMiddleware, async (req, res) => {
  const { start, end } = req.query;
  const rangeStart = start?.slice(0, 10) || '1900-01-01';
  const rangeEnd = end?.slice(0, 10) || '2100-12-31';

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.description, t.task_type, t.due_date, t.start_time, t.end_time, t.is_all_day, t.default_stars, t.project_id, p.name as project_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.household_id = t.household_id
    WHERE t.household_id = ? AND t.is_personal = 0 AND t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?
  `).all(req.user.household_id, rangeStart, rangeEnd);

  const events = tasks.map(t => ({
    id: `task-${t.id}`,
    title: t.title,
    start: t.is_all_day ? t.due_date : `${t.due_date}T${t.start_time || '09:00'}`,
    end: t.is_all_day ? t.due_date : `${t.due_date}T${t.end_time || '10:00'}`,
    allDay: !!t.is_all_day,
    resource: { type: 'task', taskId: t.id, taskType: t.task_type, projectId: t.project_id, projectName: t.project_name }
  }));

  // If user has connected Google, fetch their calendar events for the same range and merge
  try {
    if (req.user && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const tokenRow = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.user.id);
      if (tokenRow && tokenRow.access_token) {
        let accessToken = tokenRow.access_token;
        // refresh if expired
        if (tokenRow.expires_at && Number(tokenRow.expires_at) <= Date.now()) {
          try {
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: tokenRow.refresh_token,
              }),
            });
            const refreshJson = await refreshRes.json();
            if (refreshJson.access_token) {
              accessToken = refreshJson.access_token;
              db.prepare('UPDATE google_tokens SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ? WHERE user_id = ?')
                .run(accessToken, refreshJson.refresh_token || tokenRow.refresh_token, refreshJson.expires_in ? Date.now() + refreshJson.expires_in * 1000 : null, req.user.id);
            }
          } catch (err) {
            console.error('Failed to refresh Google access token', err);
          }
        }

        try {
          const timeMin = `${rangeStart}T00:00:00Z`;
          const timeMax = `${rangeEnd}T23:59:59Z`;
          const gres = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const gjson = await gres.json();
          if (Array.isArray(gjson.items)) {
            const gEvents = gjson.items.map((it) => {
              const id = `gcal-${it.id}`;
              const startVal = it.start?.dateTime || it.start?.date;
              const endVal = it.end?.dateTime || it.end?.date;
              return {
                id,
                title: it.summary || '(no title)',
                start: startVal,
                end: endVal,
                allDay: !!it.start?.date,
                resource: { type: 'gcal', gcalId: it.id, htmlLink: it.htmlLink },
              };
            });
            events.push(...gEvents);
          }
        } catch (err) {
          console.error('Failed to fetch Google Calendar events', err);
        }
      }
    }
  } catch (e) {
    console.error('Error while merging Google events', e);
  }

  res.json(events);
});

// Unknown API routes should return JSON, not the SPA shell.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// In production, serve the built client from the same origin as the API.
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(
    express.static(clientDist, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // SPA fallback for client-side routes.
  app.get('*', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MySkylight server running on http://localhost:${PORT}`);
});
