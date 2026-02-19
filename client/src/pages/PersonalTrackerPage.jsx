import React, { useEffect, useMemo, useState } from 'react';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { tracker } from '../api';
import { useQuery } from '../hooks/useQuery';
import RingProgress from '../components/RingProgress';
import WeeklyBarChart from '../components/WeeklyBarChart';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekStart() {
  return format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

function getWeekDays(weekStart) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }).map((_, idx) => {
    const date = addDays(start, idx);
    return { date: format(date, 'yyyy-MM-dd'), label: DAY_LABELS[idx], title: format(date, 'EEE, MMM d') };
  });
}

export default function PersonalTrackerPage() {
  const [weekStart] = useState(getWeekStart());
  const [draftTaskByDay, setDraftTaskByDay] = useState({});
  const [newHabit, setNewHabit] = useState('');
  const [taskOverrides, setTaskOverrides] = useState({});
  const [habitOverrides, setHabitOverrides] = useState({});
  const [trackerData, setTrackerData] = useState(null);

  const { data, loading, refetch } = useQuery(['tracker', weekStart], () => tracker.weekly({ week_start: weekStart }));

  useEffect(() => {
    if (data) setTrackerData(data);
  }, [data]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const tasks = trackerData?.tasks || [];
  const habits = trackerData?.habits || [];
  const habitLogs = trackerData?.habitLogs || [];

  const isTaskCompleted = (task) => taskOverrides[task.id] ?? !!task.completed;
  const habitCompleted = (habitId, date) => {
    const key = `${habitId}-${date}`;
    if (habitOverrides[key] !== undefined) return habitOverrides[key];
    return habitLogs.find((l) => l.habit_id === habitId && l.date === date)?.completed || false;
  };

  const buildOverview = () => {
    const daily = weekDays.map((day) => {
      const dayTasks = tasks.filter((task) => task.due_date === day.date);
      const completedTasks = dayTasks.filter(isTaskCompleted).length;
      const totalTasks = dayTasks.length;

      const completedHabits = habits.filter((habit) => habitCompleted(habit.id, day.date)).length;
      const totalHabits = habits.length;

      const completed = completedTasks + completedHabits;
      const total = totalTasks + totalHabits;

      return {
        ...day,
        dayTasks,
        completed,
        total,
        completedTasks,
        totalTasks,
        completedHabits,
        totalHabits,
        percent: total ? (completed / total) * 100 : 0,
      };
    });

    const weekly = daily.reduce((acc, day) => ({
      completedTasks: acc.completedTasks + day.completedTasks,
      totalTasks: acc.totalTasks + day.totalTasks,
      completedHabits: acc.completedHabits + day.completedHabits,
      totalHabits: acc.totalHabits + day.totalHabits,
      completed: acc.completed + day.completed,
      total: acc.total + day.total,
    }), { completedTasks: 0, totalTasks: 0, completedHabits: 0, totalHabits: 0, completed: 0, total: 0 });

    return {
      daily,
      weekly: {
        ...weekly,
        percent: weekly.total ? (weekly.completed / weekly.total) * 100 : 0,
      },
    };
  };

  const overview = useMemo(() => buildOverview(), [weekDays, tasks, habits, habitLogs, taskOverrides, habitOverrides]);
  const dailySummaries = overview.daily;
  const weeklyPercent = overview.weekly.percent;

  const runOptimistic = async (fn, rollback) => {
    try {
      await fn();
    } catch (error) {
      console.error(error);
      if (rollback) rollback();
    } finally {
      setTaskOverrides({});
      setHabitOverrides({});
    }
  };

  if (loading || !trackerData) return <div className="p-6">Loading tracker...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Personal Task & Habit Tracker</h2>
        <p className="text-slate-500">Week of {weekDays[0].title} - {weekDays[6].title}</p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-5 grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold text-slate-800 mb-4">Weekly Daily Completion</h3>
          <WeeklyBarChart days={dailySummaries} />
        </div>
        <div className="flex justify-center items-center">
          <RingProgress value={weeklyPercent} size={188} stroke={16} label="Weekly completion" />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Habit Tracker</h3>
          <div className="flex gap-2">
            <input
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              placeholder="Add habit"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={async () => {
                if (!newHabit.trim()) return;
                const name = newHabit.trim();
                setNewHabit('');
                await tracker.createHabit({ name });
                refetch();
              }}
              className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm"
            >Add</button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b">
              <th className="text-left py-2">Habit</th>
              {weekDays.map((d) => <th key={d.date} className="py-2">{d.label}</th>)}
              <th className="py-2">%</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((habit) => {
              const doneDays = weekDays.filter((d) => habitCompleted(habit.id, d.date)).length;
              const percent = (doneDays / 7) * 100;
              return (
                <tr key={habit.id} className="border-b">
                  <td className="py-2">
                    <span className="block border border-slate-200 rounded px-2 py-1 w-full bg-slate-50 text-slate-700">
                      {habit.name}
                    </span>
                  </td>
                  {weekDays.map((d) => (
                    <td key={d.date} className="text-center">
                      <input
                        type="checkbox"
                        checked={habitCompleted(habit.id, d.date)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const habitLogIndex = habitLogs.findIndex((log) => log.habit_id === habit.id && log.date === d.date);
                          const prevValue = habitLogIndex >= 0 ? habitLogs[habitLogIndex].completed : false;

                          setTrackerData((prev) => {
                            if (!prev) return prev;
                            const nextLogs = [...(prev.habitLogs || [])];
                            if (habitLogIndex >= 0) {
                              nextLogs[habitLogIndex] = { ...nextLogs[habitLogIndex], completed: checked };
                            } else {
                              nextLogs.push({ habit_id: habit.id, date: d.date, completed: checked });
                            }
                            return { ...prev, habitLogs: nextLogs };
                          });

                          setHabitOverrides((prev) => ({ ...prev, [`${habit.id}-${d.date}`]: checked }));
                          void runOptimistic(
                            () => tracker.toggleHabit(habit.id, { date: d.date, completed: checked }),
                            () => {
                              setTrackerData((prev) => {
                                if (!prev) return prev;
                                const nextLogs = [...(prev.habitLogs || [])];
                                const idx = nextLogs.findIndex((log) => log.habit_id === habit.id && log.date === d.date);
                                if (idx >= 0) {
                                  nextLogs[idx] = { ...nextLogs[idx], completed: prevValue };
                                }
                                return { ...prev, habitLogs: nextLogs };
                              });
                            }
                          );
                        }}
                      />
                    </td>
                  ))}
                  <td className="text-center font-medium">{Math.round(percent)}%</td>
                  <td className="text-center">
                    <button
                      onClick={async () => {
                        await tracker.deleteHabit(habit.id);
                        refetch();
                      }}
                      className="text-rose-600"
                    >Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {dailySummaries.map((day) => (
          <div key={day.date} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold text-slate-800">{day.title}</h4>
                <p className="text-xs text-slate-500">{day.completed}/{day.total} completed</p>
              </div>
              <RingProgress value={day.percent} size={72} stroke={7} label="Day" />
            </div>

            <div className="space-y-2">
              {day.dayTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isTaskCompleted(task)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const prevValue = !!task.completed;
                      setTrackerData((prev) => {
                        if (!prev) return prev;
                        const nextTasks = (prev.tasks || []).map((t) => (t.id === task.id ? { ...t, completed: checked } : t));
                        return { ...prev, tasks: nextTasks };
                      });
                      setTaskOverrides((prev) => ({ ...prev, [task.id]: checked }));
                      void runOptimistic(
                        () => tracker.toggleTask(task.id, { date: day.date, completed: checked }),
                        () => {
                          setTrackerData((prev) => {
                            if (!prev) return prev;
                            const nextTasks = (prev.tasks || []).map((t) => (t.id === task.id ? { ...t, completed: prevValue } : t));
                            return { ...prev, tasks: nextTasks };
                          });
                        }
                      );
                    }}
                  />
                  <span className="flex-1 border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-700">
                    {task.title}
                  </span>
                  <button className="text-rose-600 text-xs" onClick={async () => { await tracker.deleteTask(task.id); refetch(); }}>Delete</button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={draftTaskByDay[day.date] || ''}
                onChange={(e) => setDraftTaskByDay((prev) => ({ ...prev, [day.date]: e.target.value }))}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Add a task"
              />
              <button
                onClick={async () => {
                  const title = (draftTaskByDay[day.date] || '').trim();
                  if (!title) return;
                  setDraftTaskByDay((prev) => ({ ...prev, [day.date]: '' }));
                  await tracker.createTask({ title, due_date: day.date });
                  refetch();
                }}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
              >Add</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
