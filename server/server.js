import express from 'express';
import cors from 'cors';
import db from './database.js';
import { hashPassword, verifyPassword, createToken, authMiddleware } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Auth routes
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, color } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password required' });
    }
    const password_hash = hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, color)
      VALUES (?, ?, ?, ?)
    `).run(name, email, password_hash, color || '#6366f1');
    const user = db.prepare('SELECT id, name, email, color FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ user, token: createToken(user) });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const { password_hash, ...safeUser } = user;
  const safeUserObj = { id: safeUser.id, name: safeUser.name, email: safeUser.email, color: safeUser.color };
  res.json({ user: safeUserObj, token: createToken(safeUserObj) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// Users list (for assignment dropdowns)
app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, name, email, color FROM users ORDER BY name').all();
  res.json(users);
});

// Tasks CRUD
app.get('/api/tasks', authMiddleware, (req, res) => {
  const { type, assigned_to } = req.query;
  let sql = `
    SELECT t.*, 
      (SELECT json_group_array(user_id) FROM task_assignments WHERE task_id = t.id) as assigned_user_ids
    FROM tasks t
    ORDER BY t.task_type, t.title
  `;
  const tasks = db.prepare(sql).all();

  let filtered = tasks.map(t => ({
    ...t,
    assigned_user_ids: t.assigned_user_ids ? JSON.parse(t.assigned_user_ids) : [],
    is_group_task: !!t.is_group_task,
    is_all_day: t.is_all_day !== 0
  }));

  if (type) filtered = filtered.filter(t => t.task_type === type);
  if (assigned_to) {
    const uid = parseInt(assigned_to);
    if (assigned_to === 'unassigned') {
      filtered = filtered.filter(t => !t.assigned_user_ids?.length);
    } else if (!isNaN(uid)) {
      filtered = filtered.filter(t => t.assigned_user_ids?.includes(uid));
    }
  }

  res.json(filtered);
});

app.post('/api/tasks', authMiddleware, (req, res) => {
  const {
    title, description, task_type, recurrence_pattern, default_stars,
    is_group_task, group_id, due_date, start_time, end_time, is_all_day, assigned_user_ids
  } = req.body;

  const result = db.prepare(`
    INSERT INTO tasks (title, description, task_type, recurrence_pattern, default_stars, is_group_task, group_id, due_date, start_time, end_time, is_all_day, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description || null,
    task_type || 'daily',
    recurrence_pattern || null,
    default_stars ?? 1,
    is_group_task ? 1 : 0,
    group_id || null,
    due_date || null,
    start_time || null,
    end_time || null,
    is_all_day !== false ? 1 : 0,
    req.user.id
  );

  const taskId = result.lastInsertRowid;

  if (assigned_user_ids?.length) {
    const insert = db.prepare('INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)');
    for (const uid of assigned_user_ids) {
      insert.run(taskId, uid);
    }
  }

  const task = db.prepare(`
    SELECT t.*, (SELECT json_group_array(user_id) FROM task_assignments WHERE task_id = t.id) as assigned_user_ids
    FROM tasks t WHERE t.id = ?
  `).get(taskId);
  task.assigned_user_ids = task.assigned_user_ids ? JSON.parse(task.assigned_user_ids) : [];
  task.is_group_task = !!task.is_group_task;
  task.is_all_day = task.is_all_day !== 0;

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
    assigned_user_ids
  } = req.body;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

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
      is_all_day = COALESCE(?, is_all_day)
    WHERE id = ?
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
    id
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
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
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
    WHERE 1=1
  `;
  const params = [];
  if (task_id) { sql += ' AND tc.task_id = ?'; params.push(task_id); }
  if (user_id) { sql += ' AND tc.user_id = ?'; params.push(user_id); }
  if (start_date) { sql += ' AND date(tc.completed_at) >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND date(tc.completed_at) <= ?'; params.push(end_date); }
  sql += ' ORDER BY tc.completed_at DESC';

  const completions = db.prepare(sql).all(...params);
  res.json(completions);
});

// Task completions - batch support
app.post('/api/completions', authMiddleware, (req, res) => {
  let { task_id, user_id, user_ids, stars_earned, notes } = req.body;

  if (!task_id) return res.status(400).json({ error: 'task_id is required' });

  const task = db.prepare('SELECT id, default_stars FROM tasks WHERE id = ?').get(task_id);
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
  db.prepare('DELETE FROM task_completions WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// Task completions - batch update
app.patch('/api/completions', authMiddleware, (req, res) => {
  let { updates, task_id } = req.body; 
  if (!updates) updates = [];
  if (!Array.isArray(updates)) updates = [updates];

  if (!task_id) return res.status(400).json({ error: 'task_id is required' });

  const updatedCompletions = [];

  const selectStmt = db.prepare(`
    SELECT tc.*, t.title as task_title, u.name as user_name, u.color as user_color
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE tc.id = ?
  `);

  const updateStmt = db.prepare(`
    UPDATE task_completions
    SET stars_earned = COALESCE(?, stars_earned),
        notes = COALESCE(?, notes)
    WHERE id = ?
  `);

  for (const upd of updates) {
    const existing = selectStmt.get(upd.id);
    if (!existing) continue;

    updateStmt.run(
      upd.stars_earned ?? null,
      upd.notes ?? null,
      upd.id
    );

    const updated = selectStmt.get(upd.id);
    updatedCompletions.push(updated);
  }

  // Return all completions for this task
  const finalCompletions = db.prepare(`
    SELECT tc.*, t.title as task_title, u.name as user_name, u.color as user_color
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    LEFT JOIN users u ON u.id = tc.user_id
    WHERE tc.task_id = ?
  `).all(task_id);

  res.json(finalCompletions);
});




// Insights & analytics
app.get('/api/insights/scores', authMiddleware, (req, res) => {
  const { start_date, end_date } = req.query;
  const params = [];
  let joinExtra = '';
  if (start_date) { joinExtra += ' AND date(tc.completed_at) >= ?'; params.push(start_date); }
  if (end_date) { joinExtra += ' AND date(tc.completed_at) <= ?'; params.push(end_date); }

  const scores = db.prepare(`
    SELECT u.id, u.name, u.color,
      COALESCE(SUM(tc.stars_earned), 0) as total_stars,
      COUNT(tc.id) as completions_count
    FROM users u
    LEFT JOIN task_completions tc ON tc.user_id = u.id ${joinExtra}
    GROUP BY u.id
    ORDER BY total_stars DESC
  `).all(...params);
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
    WHERE 1=1
  `;
  const params = [];
  if (task_id) { sql += ' AND tc.task_id = ?'; params.push(task_id); }
  if (start_date) { sql += ' AND date(tc.completed_at) >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND date(tc.completed_at) <= ?'; params.push(end_date); }
  sql += ' GROUP BY tc.user_id, tc.task_id ORDER BY t.title, count DESC';

  const counts = db.prepare(sql).all(...params);
  res.json(counts);
});

app.get('/api/insights/overview', authMiddleware, (req, res) => {
  const { start_date, end_date } = req.query;
  const params = [];
  let dateFilter = '';
  if (start_date && end_date) {
    dateFilter = 'WHERE date(completed_at) BETWEEN ? AND ?';
    params.push(start_date, end_date);
  } else if (start_date) {
    dateFilter = 'WHERE date(completed_at) >= ?';
    params.push(start_date);
  } else if (end_date) {
    dateFilter = 'WHERE date(completed_at) <= ?';
    params.push(end_date);
  }
  const tcDateFilter = dateFilter.replace('date(completed_at)', 'date(tc.completed_at)');

  const totalCompletions = db.prepare(`SELECT COUNT(*) as total FROM task_completions ${dateFilter}`).get(...params)?.total || 0;
  const totalStars = db.prepare(`SELECT COALESCE(SUM(stars_earned), 0) as total FROM task_completions ${dateFilter}`).get(...params)?.total || 0;
  const topTasks = db.prepare(`
    SELECT t.title, t.task_type, COUNT(tc.id) as completions
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id ${tcDateFilter}
    GROUP BY tc.task_id
    ORDER BY completions DESC
    LIMIT 10
  `).all(...params);

  res.json({ totalCompletions: totalCompletions, totalStars, topTasks });
});

// Calendar events (combine tasks with due dates and completions for display)
app.get('/api/calendar/events', authMiddleware, (req, res) => {
  const { start, end } = req.query;
  const tasks = db.prepare(`
    SELECT id, title, description, task_type, due_date, start_time, end_time, is_all_day, default_stars
    FROM tasks
    WHERE due_date IS NOT NULL AND due_date >= ? AND due_date <= ?
  `).all(start?.slice(0, 10) || '1900-01-01', end?.slice(0, 10) || '2100-12-31');

  const events = tasks.map(t => ({
    id: `task-${t.id}`,
    title: t.title,
    start: t.is_all_day ? t.due_date : `${t.due_date}T${t.start_time || '09:00'}`,
    end: t.is_all_day ? t.due_date : `${t.due_date}T${t.end_time || '10:00'}`,
    allDay: !!t.is_all_day,
    resource: { type: 'task', taskId: t.id, taskType: t.task_type }
  }));

  res.json(events);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MySkylight server running on http://10.0.0.130:${PORT}`);
});
