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
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

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
    WHERE t.is_personal = 0
    ORDER BY t.task_type, t.title
  `;
  const tasks = db.prepare(sql).all();

  let filtered = tasks.map(t => ({
    ...t,
    assigned_user_ids: t.assigned_user_ids ? JSON.parse(t.assigned_user_ids) : [],
    is_group_task: !!t.is_group_task,
    is_all_day: t.is_all_day !== 0,
    is_personal: !!t.is_personal
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
    is_group_task, group_id, due_date, start_time, end_time, is_all_day, is_personal, assigned_user_ids
  } = req.body;

  const result = db.prepare(`
    INSERT INTO tasks (title, description, task_type, recurrence_pattern, default_stars, is_group_task, group_id, due_date, start_time, end_time, is_all_day, is_personal, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    is_personal ? 1 : 0,
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
      is_all_day = COALESCE(?, is_all_day),
      is_personal = COALESCE(?, is_personal)
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
    is_personal !== undefined ? (is_personal ? 1 : 0) : null,
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
    WHERE t.is_personal = 0
  `;
  const params = [];
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
    INSERT INTO tasks (title, task_type, recurrence_pattern, due_date, created_by, is_all_day, is_personal)
    VALUES (?, 'one-time', 'personal_tracker', ?, ?, 1, 1)
  `).run(title, due_date, req.user.id);

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
    LEFT JOIN tasks t ON t.id = tc.task_id AND t.is_personal = 0
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
    WHERE t.is_personal = 0
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
  const personalExclusion = tcDateFilter ? `${tcDateFilter} AND t.is_personal = 0` : 'WHERE t.is_personal = 0';

  const totalCompletions = db.prepare(`
    SELECT COUNT(tc.id) as total
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    ${personalExclusion}
  `).get(...params)?.total || 0;
  const totalStars = db.prepare(`
    SELECT COALESCE(SUM(tc.stars_earned), 0) as total
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id
    ${personalExclusion}
  `).get(...params)?.total || 0;
  const topTasks = db.prepare(`
    SELECT t.title, t.task_type, COUNT(tc.id) as completions
    FROM task_completions tc
    JOIN tasks t ON t.id = tc.task_id ${personalExclusion}
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
    WHERE is_personal = 0 AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ?
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
  console.log(`MySkylight server running on http://localhost:${PORT}`);
});
