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
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
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
`);

// Backward-compatible migration for existing databases.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
const hasColorColumn = userColumns.some((column) => column.name === 'color');
if (!hasColorColumn) {
  db.exec("ALTER TABLE users ADD COLUMN color TEXT DEFAULT '#6366f1'");
}

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

// Seed default data if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const bcrypt = (await import('bcryptjs')).default;
  const hash = bcrypt.hashSync('demo123', 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, color) VALUES
    ('Demo User', 'demo@myskylight.app', ?, '#6366f1'),
    ('Family Member', 'family@myskylight.app', ?, '#ec4899')
  `).run(hash, hash);

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
