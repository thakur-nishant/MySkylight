import React, { useEffect, useState } from 'react';
import { calendar, completions } from '../api';
import { format } from 'date-fns';
import { formatDatePST, todayPST } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';

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
  const todayDate = todayPST();
  const todayStr = formatDatePST(todayDate); // yyyy-MM-dd

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function load() {
      try {
        const ev = await calendar.events({ start: todayStr, end: todayStr });
        // fetch today's completions for current user to determine completed state
        const comps = await completions.list({ start_date: todayStr, end_date: todayStr, user_id: user?.id });
        const completedMap = new Map();
        (comps || []).forEach((c) => {
          // server returns task_id on completion entries
          if (c.task_id != null) completedMap.set(String(c.task_id), c.id);
        });

        const taskEvents = (ev || []).filter((e) => e.resource?.type === 'task').map((e) => {
          const taskId = String(e.resource.taskId || '').replace(/^task-/, '');
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

        if (!mounted) return;
        setEvents(ev || []);
        setTasks(taskEvents);
      } catch (err) {
        console.error('Failed to load today data', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (user) load();
    return () => { mounted = false; };
  }, [todayStr, user]);

  const firstEvent = events[0];

  async function toggleTask(task) {
    const original = tasks;
    const wasCompleted = !!task.completed;
    const updated = tasks.map((t) => (t.id === task.id ? { ...t, completed: !wasCompleted } : t));
    setTasks(updated);

    try {
      if (wasCompleted) {
        // delete the completion
        if (task.completionId) {
          await completions.delete(task.completionId);
          setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: false, completionId: null } : t));
        }
      } else {
        // create completion (server defaults user to current user if not supplied)
        const res = await completions.create({ task_id: Number(task.id) });
        // server returns array of inserted completions
        const newComp = Array.isArray(res) ? res[0] : res;
        const compId = newComp?.id ?? null;
        setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: true, completionId: compId } : t));
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
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">{task.title}</div>
                    <div className="text-xs text-slate-500">{task.project_name || ''}</div>
                  </div>
                  <div>
                    <button onClick={() => toggleTask(task)} className={`px-3 py-1 rounded ${task.completed ? 'bg-emerald-500 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>
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
    </div>
  );
}
