import React, { useEffect, useState } from 'react';
import { calendar, completions, users as usersApi, tasks as tasksApi } from '../api';
import { format } from 'date-fns';
import { formatDatePST, todayPST, zonedTimeToUtc } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import CompleteTaskModal from '../components/CompleteTaskModal';

function prettyDate(date) {
  return format(date, 'EEEE, MMMM d');
}

function prettyTime(iso) {
  try {
    if (!iso) return '';
    if (iso.indexOf('T') === -1) return iso;
    const t = iso.split('T')[1].slice(0,5);
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date();
    d.setHours(hh);
    d.setMinutes(mm);
    return format(d, 'h:mm a');
  } catch (e) { return iso; }
}

export default function TodayPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedCompletions, setSelectedCompletions] = useState([]);

  const todayDate = todayPST();
  const todayStr = formatDatePST(todayDate); // yyyy-MM-dd
  const completionRange = {
    start: zonedTimeToUtc(`${todayStr}T00:00:00`)?.toISOString(),
    end: zonedTimeToUtc(`${todayStr}T23:59:59`)?.toISOString(),
  };

  const { data: users } = useQuery(['users-for-today'], () => usersApi.list(), { enabled: true });

  async function load() {
    setLoading(true);
    try {
      const ev = await calendar.events({ start: todayStr, end: todayStr });
      // fetch today's completions for current user to determine completed state
      const comps = await completions.list({
        start_date: completionRange.start,
        end_date: completionRange.end,
        user_id: user?.id,
      });
      const completedMap = new Map();
      (comps || []).forEach((c) => {
        if (c.task_id != null) completedMap.set(String(c.task_id), c.id);
      });

      const taskEvents = (ev || []).filter((e) => e.resource?.type === 'task').map((e) => {
        const tid = e.resource?.taskId ?? (e.id ? ('' + e.id).replace(/^task-/, '') : null);
        const key = String(tid);
        return {
          id: key,
          title: e.title,
          project_name: e.resource?.projectName,
          start: e.start,
          end: e.end,
          allDay: !!e.allDay,
          completed: completedMap.has(key),
          completionId: completedMap.get(key) || null,
        };
      });

      // also include daily tasks from the general task list
      const allTasks = await tasksApi.list();
      const dailyTasks = (allTasks || []).filter((t) => t.task_type === 'daily');
      const dailyConverted = dailyTasks.map((t) => {
        const id = String(t.id);
        return {
          id,
          title: t.title,
          project_name: t.project_name || t.project_name || '',
          start: null,
          end: null,
          allDay: true,
          completed: completedMap.has(id),
          completionId: completedMap.get(id) || null,
        };
      });

      // merge, prefer calendar event entries (preserve order), avoid duplicates
      const seen = new Set();
      const merged = [];
      for (const te of taskEvents) {
        if (!seen.has(te.id)) { seen.add(te.id); merged.push(te); }
      }
      for (const dt of dailyConverted) {
        if (!seen.has(dt.id)) { seen.add(dt.id); merged.push(dt); }
      }

      setEvents(ev || []);
      setTasks(merged);
    } catch (err) {
      console.error('Failed to load today data', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load regardless of whether user object is ready — completions list will filter by user when available.
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, user]);

  const firstEvent = events[0];

  async function openTaskModal(task) {
    setSelectedTask(task);
    try {
      const comps = await completions.list({
        task_id: task.id,
        start_date: completionRange.start,
        end_date: completionRange.end,
      });
      setSelectedCompletions(Array.isArray(comps) ? comps : []);
    } catch (err) {
      console.error('failed to load completions for task', err);
      setSelectedCompletions([]);
    }
  }

  const closeModal = () => {
    setSelectedTask(null);
    setSelectedCompletions([]);
    void load();
  };

  async function toggleInline(task) {
    const original = tasks;
    const wasCompleted = !!task.completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !wasCompleted } : t)));

    try {
      if (wasCompleted) {
        if (task.completionId) {
          await completions.delete(task.completionId);
        }
      } else {
        const res = await completions.create({ task_id: Number(task.id) });
        const newComp = Array.isArray(res) ? res[0] : res;
        const compId = newComp?.id ?? null;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: true, completionId: compId } : t)));
      }
    } catch (err) {
      console.error('toggle failed', err);
      setTasks(original);
    }
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">{prettyDate(todayDate)}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Overview of your day</p>
          </div>
        </header>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-2">Today's event</h3>
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : firstEvent ? (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm text-slate-500 dark:text-slate-400">{firstEvent.allDay ? 'All day' : `${prettyTime(firstEvent.start)} — ${prettyTime(firstEvent.end)}`}</div>
                <div className="text-md font-semibold mt-1">{firstEvent.title}</div>
                {firstEvent.resource?.projectName && (
                  <div className="text-sm text-slate-500 mt-1">{firstEvent.resource.projectName}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No events today.</div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-2">Today's tasks</h3>
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : tasks.length ? (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                  <button onClick={() => openTaskModal(task)} className="flex-1 text-left">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{task.title}</div>
                    <div className="text-xs text-slate-500">{task.project_name || ''}</div>
                  </button>
                  <div>
                    <button onClick={() => toggleInline(task)} className={`px-3 py-1 rounded ${task.completed ? 'bg-emerald-500 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
                      {task.completed ? 'Done' : 'Mark done'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">No tasks for today.</div>
          )}
        </section>
      </div>

      {selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          existingCompletions={selectedCompletions}
          users={Array.isArray(users) ? users : []}
          currentUser={user}
          onClose={closeModal}
          onComplete={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
