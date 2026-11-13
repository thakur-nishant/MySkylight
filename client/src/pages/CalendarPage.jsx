import React, { useMemo, useState, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  getDay,
  isSameDay,
  isSameWeek,
  isSameMonth,
} from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '../context/AuthContext';

import { useQuery } from '../hooks/useQuery';
import {
  tasks as tasksApi,
  completions,
  users as usersApi,
  projects as projectsApi,
  calendar as calendarApi,
} from '../api';
import CompleteTaskModal from '../components/CompleteTaskModal';
import TaskModal from '../components/TaskModal';
import CalendarSourcesPanel from '../components/CalendarSourcesPanel';
import CalendarImportModal from '../components/CalendarImportModal';
import { CalendarPlus, CheckCircle, Circle, Download, X } from 'lucide-react';
import { toPST, todayPST, formatDatePST, zonedTimeToUtc } from '../utils/dateUtils';

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

const SYSTEM_EVENT_STYLES = {
  'hindu-festivals': {
    backgroundColor: '#fcd34d',
    border: '1px solid #d97706',
    color: '#451a03',
  },
  'hindu-panchang': {
    backgroundColor: '#c4b5fd',
    border: '1px solid #7c3aed',
    color: '#2e1065',
  },
};

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function SystemEventDetails({ event, onClose }) {
  const resource = event.resource ?? {};
  const firstDate = parseDateOnly(resource.firstDate) ?? event.start;
  const lastDate = parseDateOnly(resource.lastDate) ?? event.start;
  const dateLabel = isSameDay(firstDate, lastDate)
    ? format(firstDate, 'EEEE, MMM d, yyyy')
    : `${format(firstDate, 'MMM d, yyyy')} – ${format(lastDate, 'MMM d, yyyy')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: resource.calendarColor }}
              />
              {resource.calendarName || 'Imported calendar'}
            </div>
            <h2 className="mt-2 font-display text-xl font-bold text-slate-900">{event.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event details"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {resource.description && (
            <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
              {resource.description}
            </p>
          )}

          {resource.rule && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                How this date is calculated
              </summary>
              <p className="mt-2 text-sm leading-6 text-slate-600">{resource.rule}</p>
            </details>
          )}

          {resource.attribution && (
            <p className="text-xs text-slate-400">{resource.attribution}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedSystemEvent, setSelectedSystemEvent] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [currentDate, setCurrentDate] = useState(() => todayPST());
  const [visibleRange, setVisibleRange] = useState(() => {
    const referenceDate = todayPST();
    return {
      start: formatDatePST(startOfMonth(referenceDate)),
      end: formatDatePST(endOfMonth(referenceDate)),
    };
  });
  const [sourcePendingId, setSourcePendingId] = useState(null);
  const [sourcesError, setSourcesError] = useState('');
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
    const rangeStartPst = formatDatePST(rangeStart);
    const rangeEndPst = formatDatePST(referenceDate);
    const rangeStartUtc = zonedTimeToUtc(`${rangeStartPst}T00:00:00`);
    const rangeEndUtc = zonedTimeToUtc(`${rangeEndPst}T23:59:59`);
    const toUtcSql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    return {
      start: toUtcSql(rangeStartUtc),
      end: toUtcSql(rangeEndUtc),
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
  const fetchProjects = useCallback(() => projectsApi.list(), []);
  const fetchSources = useCallback(() => calendarApi.sources(), []);
  const fetchFeed = useCallback(
    () => calendarApi.events({ start: visibleRange.start, end: visibleRange.end }),
    [visibleRange.start, visibleRange.end]
  );

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

  const { data: allProjects } = useQuery(['projects-all'], fetchProjects);
  const projects = Array.isArray(allProjects) ? allProjects : [];

  const {
    data: sourcesData,
    loading: sourcesLoading,
    error: sourcesFetchError,
    refetch: refetchSources,
  } = useQuery(['calendar-sources'], fetchSources);
  const sources = Array.isArray(sourcesData?.sources) ? sourcesData.sources : [];
  const google = sourcesData?.google ?? { enabled: false, connected: false };
  const hasSystemCalendar = sources.some((source) => source.enabled);

  const { data: feedData, refetch: refetchFeed } = useQuery(
    ['calendar-feed', visibleRange.start, visibleRange.end],
    fetchFeed,
    { enabled: hasSystemCalendar }
  );

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
          resource: { type: 'task', taskId: t.id },
        };
      });
  }, [taskList]);

  const systemEvents = useMemo(() => {
    const feed = Array.isArray(feedData) ? feedData : [];
    const enabledIds = new Set(sources.filter((source) => source.enabled).map((source) => source.id));
    return feed
      .filter(
        (event) =>
          event.resource?.type === 'system' && enabledIds.has(event.resource.calendarId)
      )
      .map((event) => {
        const start = parseDateOnly(event.start);
        const end = parseDateOnly(event.end);
        if (!start || !end) return null;
        return { ...event, start, end };
      })
      .filter(Boolean);
  }, [feedData, sources]);

  const events = useMemo(
    () => [...calendarEvents, ...systemEvents],
    [calendarEvents, systemEvents]
  );

  /** -----------------------------
   * Calendar actions
   * ----------------------------- */
  const handleRangeChange = useCallback((range) => {
    if (!range) return;
    if (Array.isArray(range)) {
      if (range.length === 0) return;
      setVisibleRange({
        start: formatDatePST(range[0]),
        end: formatDatePST(range[range.length - 1]),
      });
      return;
    }
    if (range.start && range.end) {
      setVisibleRange({
        start: formatDatePST(range.start),
        end: formatDatePST(range.end),
      });
    }
  }, []);

  const handleSelectEvent = useCallback((event) => {
    if (event.resource?.type === 'system') {
      setSelectedSystemEvent(event);
      return;
    }
    if (event.task) {
      setSelectedTask(event.task);
    }
  }, []);

  const eventPropGetter = useCallback((event) => {
    if (event.resource?.type === 'system') {
      return {
        style:
          SYSTEM_EVENT_STYLES[event.resource.calendarId] ?? {
            backgroundColor: '#e2e8f0',
            border: '1px solid #94a3b8',
            color: '#0f172a',
          },
      };
    }
    return {};
  }, []);

  const handleToggleSource = useCallback(
    async (id, enabled) => {
      setSourcePendingId(id);
      setSourcesError('');
      try {
        await calendarApi.updateSource(id, enabled);
        await refetchSources();
        await refetchFeed();
      } catch (err) {
        setSourcesError(err.message || 'Failed to update calendar');
      } finally {
        setSourcePendingId(null);
      }
    },
    [refetchSources, refetchFeed]
  );

  const handleGoogleImported = useCallback(() => {
    refetchTasks();
    refetchCompletions();
    refetchFeed();
  }, [refetchTasks, refetchCompletions, refetchFeed]);

  /** -----------------------------
   * Completed tasks lookup
   * ----------------------------- */
  const parseCompletionDate = useCallback((completion) => {
    if (!completion?.completed_at) return null;
    const normalized = completion.completed_at.replace(' ', 'T');
    const utcDate = new Date(`${normalized}Z`);
    return Number.isNaN(utcDate.getTime()) ? null : utcDate;
  }, []);

  const isCompletionInPeriod = useCallback(
    (task, completion) => {
      if (!task || !completion) return false;
      const referenceDate = currentDate ?? todayPST();
      const completionUtc = parseCompletionDate(completion);
      if (!completionUtc) return false;
      const completedDate = toPST(completionUtc);

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
    [currentDate, parseCompletionDate]
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
        {task.project_name && <span className="ml-2 text-xs text-indigo-600">[{task.project_name}]</span>}
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

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500">Household tasks, events, and imported calendars</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedTask(null);
              setSelectedSystemEvent(null);
              setModalDate(todayPST());
              setShowTaskModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <CalendarPlus className="h-4 w-4" />
            New event
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Import calendars
          </button>
        </div>
      </div>

      {/* Calendar + calendar sources */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 500 }}
            eventPropGetter={eventPropGetter}
            onSelectEvent={handleSelectEvent}
            onNavigate={(date) => setCurrentDate(toPST(date))}
            onRangeChange={handleRangeChange}
            onSelectSlot={(slotInfo) => {
              setSelectedTask(null);
              setSelectedSystemEvent(null);
              setModalDate(slotInfo.start);
              setShowTaskModal(true);
            }}
            selectable
          />
        </div>

        <CalendarSourcesPanel
          sources={sources}
          loading={sourcesLoading}
          error={sourcesError || (sourcesFetchError ? 'Failed to load calendars' : '')}
          pendingId={sourcePendingId}
          onToggle={handleToggleSource}
          onImport={() => setShowImportModal(true)}
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
          projects={projects}
          initialDate={modalDate}
          onClose={() => {
            setShowTaskModal(false);
            refetchTasks();
            refetchCompletions();
            refetchFeed();
          }}
        />
      )}

      {selectedSystemEvent && (
        <SystemEventDetails
          event={selectedSystemEvent}
          onClose={() => setSelectedSystemEvent(null)}
        />
      )}

      {showImportModal && (
        <CalendarImportModal
          sources={sources}
          google={google}
          pendingId={sourcePendingId}
          onToggle={handleToggleSource}
          onClose={() => setShowImportModal(false)}
          onImported={handleGoogleImported}
        />
      )}
    </div>
  );
}
