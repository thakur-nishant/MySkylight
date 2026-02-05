import React, { useMemo, useState, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  startOfMonth,
  getDay,
  isSameDay,
  isSameWeek,
  isSameMonth,
} from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '../context/AuthContext';

import { useQuery } from '../hooks/useQuery';
import { tasks as tasksApi, completions, users as usersApi } from '../api';
import CompleteTaskModal from '../components/CompleteTaskModal';
import TaskModal from '../components/TaskModal';
import { CheckCircle, Circle } from 'lucide-react';
import { toPST, todayPST } from '../utils/dateUtils';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => {
    const now = todayPST();
    return startOfWeek(now, { weekStartsOn: 0 }); // Sunday start
  },
  getDay,
  locales: { 'en-US': enUS },
});

export default function CalendarPage() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [currentDate, setCurrentDate] = useState(() => todayPST());
  const { user: currentUser } = useAuth();

  /** -----------------------------
   * Stable fetchers
   * ----------------------------- */
  const fetchTasks = useCallback(() => tasksApi.list(), []);
  const completionRange = useMemo(() => {
    const referenceDate = currentDate ?? todayPST();
    const weekStart = startOfWeek(referenceDate, { weekStartsOn: 0 });
    const monthStart = startOfMonth(referenceDate);
    const rangeStart = weekStart < monthStart ? weekStart : monthStart;

    return {
      start: format(rangeStart, 'yyyy-MM-dd'),
      end: format(referenceDate, 'yyyy-MM-dd'),
    };
  }, [currentDate]);

  const fetchCompletions = useCallback(
    () =>
      completions.list({
        start_date: completionRange.start,
        end_date: completionRange.end,
      }),
    [completionRange.start, completionRange.end]
  );
  const fetchUsers = useCallback(() => usersApi.list(), []);

  /** -----------------------------
   * Queries
   * ----------------------------- */
  const { data: allTaskList, refetch: refetchTasks } = useQuery(['tasks-all'], fetchTasks);
  const taskList = Array.isArray(allTaskList) ? allTaskList : [];

  const { data: allCompletionList, refetch: refetchCompletions } = useQuery(
    ['completions-all', completionRange.start, completionRange.end],
    fetchCompletions
  );
  const completionList = Array.isArray(allCompletionList) ? allCompletionList : [];

  const { data: allUsers } = useQuery(['users-all'], fetchUsers);
  const users = Array.isArray(allUsers) ? allUsers : [];

  /** -----------------------------
   * Calendar events (one-time + event tasks)
   * ----------------------------- */
  const calendarEvents = useMemo(() => {
    return taskList
      .filter((t) => (t.task_type === 'one-time' || t.task_type === 'event') && t.due_date)
      .map((t) => {
        const pstDate = toPST(t.due_date);
        return {
          id: t.id,
          title: t.title,
          start: pstDate,
          end: pstDate,
          allDay: true,
          task: t,
        };
      });
  }, [taskList]);

  /** -----------------------------
   * Completed tasks lookup
   * ----------------------------- */
  const isCompletionInPeriod = useCallback(
    (task, completion) => {
      if (!task || !completion) return false;
      const referenceDate = currentDate ?? todayPST();
      const completedDate = toPST(completion.completed_at);

      if (task.task_type === 'daily') {
        return isSameDay(completedDate, referenceDate);
      }

      if (task.task_type === 'weekly') {
        return isSameWeek(completedDate, referenceDate, { weekStartsOn: 0 });
      }

      if (task.task_type === 'monthly') {
        return isSameMonth(completedDate, referenceDate);
      }

      // one-time & event tasks
      return true;
    },
    [currentDate]
  );

  const completedTaskIds = useMemo(() => {
    return new Set(
      completionList
        .filter((c) => {
          const task = taskList.find((t) => t.id === c.task_id);
          return isCompletionInPeriod(task, c);
        })
        .map((c) => c.task_id)
    );
  }, [completionList, taskList, isCompletionInPeriod]);
  

  /** -----------------------------
   * Selected task completions
   * ----------------------------- */
  const selectedCompletion = useMemo(() => {
    if (!selectedTask) return null;
    const matches = completionList.filter(
      (c) => c.task_id === selectedTask.id && isCompletionInPeriod(selectedTask, c)
    );
    return matches.length > 0 ? matches : [];
  }, [selectedTask, completionList, isCompletionInPeriod]);

  /** -----------------------------
   * Grouped task panels
   * ----------------------------- */
  const panels = useMemo(() => {
    const groups = { daily: [], weekly: [], monthly: [] };
    taskList.forEach((t) => {
      if (groups[t.task_type]) {
        groups[t.task_type].push({
          ...t,
          completed: completedTaskIds.has(t.id),
        });
      }
    });
    const sortTasks = (a, b) => Number(a.completed) - Number(b.completed);
    return {
      daily: groups.daily.sort(sortTasks),
      weekly: groups.weekly.sort(sortTasks),
      monthly: groups.monthly.sort(sortTasks),
    };
  }, [taskList, completedTaskIds]);

  /** -----------------------------
   * Task row component
   * ----------------------------- */
  const TaskRow = ({ task }) => (
    <button
      onClick={() => setSelectedTask(task)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-left"
    >
      {task.completed ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5 text-slate-400" />}
      <span className={`flex-1 ${task.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
      </span>
    </button>
  );

  /** -----------------------------
   * Panel component
   * ----------------------------- */
  const TaskPanel = ({ title, tasks }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-3 space-y-1 max-h-[300px] overflow-y-auto">
        {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks</p>}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  );

  /** -----------------------------
   * Handle selecting a task
   * ----------------------------- */
  const handleSelectTask = (task) => {
    setSelectedTask(task);
  };

  return (
    <div className="p-8 space-y-8">
      {/* Calendar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 500 }}
          onSelectEvent={(e) => handleSelectTask(e.task)}
          onNavigate={(date) => setCurrentDate(toPST(date))}
          onSelectSlot={(slotInfo) => {
            setSelectedTask(null);
            setModalDate(slotInfo.start);
            setShowTaskModal(true);
          }}
          selectable
        />
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TaskPanel title="Daily tasks" tasks={panels.daily} />
        <TaskPanel title="Weekly tasks" tasks={panels.weekly} />
        <TaskPanel title="Monthly tasks" tasks={panels.monthly} />
      </div>

      {/* CompleteTaskModal for existing tasks */}
      {selectedTask && (
        <CompleteTaskModal
          task={selectedTask}
          existingCompletions={selectedCompletion}
          users={users}
          currentUser={currentUser}
          onClose={() => {
            setSelectedTask(null);
            refetchTasks();
            refetchCompletions();
          }}
          onComplete={() => {
            refetchTasks();
            refetchCompletions();
          }}
        />
      )}

      {/* TaskModal for new event */}
      {showTaskModal && (
        <TaskModal
          task={null}
          users={users}
          initialDate={modalDate}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </div>
  );
}
