import React, { useState, useMemo } from 'react';
import { useQuery } from '../hooks/useQuery';
import { insights, tasks as tasksApi } from '../api';
import { Star, TrendingUp, CheckCircle, Award } from 'lucide-react';
import {
  getWeekRangePST,
  getMonthRangePST,
  getYearRangePST,
} from '../utils/dateUtils';


/* ----------------------------------------
 * Component
 * ---------------------------------------- */
export default function InsightsPage() {
  const initialCustomRange = useMemo(() => getWeekRangePST(), []);
  const [range, setRange] = useState('week');
  const [customStart, setCustomStart] = useState(initialCustomRange.start);
  const [customEnd, setCustomEnd] = useState(initialCustomRange.end);
  const [filterTask, setFilterTask] = useState('');

  const { start, end } = useMemo(() => {
    if (range === 'week') return getWeekRangePST();
    if (range === 'month') return getMonthRangePST();
    if (range === 'custom') {
      const normalizedStart = customStart && customEnd && customStart > customEnd
        ? customEnd
        : customStart;
      const normalizedEnd = customStart && customEnd && customEnd < customStart
        ? customStart
        : customEnd;

      return {
        start: normalizedStart,
        end: normalizedEnd,
      };
    }
    return getYearRangePST();
  }, [range, customStart, customEnd]);

  const params = { start_date: start, end_date: end };
  const taskCountParams = { ...params };
  if (filterTask) taskCountParams.task_id = filterTask;

  /* ----------------------------------------
   * Queries
   * ---------------------------------------- */
  const { data: rawTaskList } = useQuery(['tasks-all'], () => tasksApi.list());
  const taskList = rawTaskList || [];

  const { data: rawScores } = useQuery(
    ['insights-scores', start, end],
    () => insights.scores(params)
  );
  const scores = rawScores || [];

  const { data: rawTaskCounts } = useQuery(
    ['insights-task-counts', start, end, filterTask],
    () => insights.taskCounts(taskCountParams)
  );
  const taskCounts = rawTaskCounts || [];

  const { data: rawOverview } = useQuery(
    ['insights-overview', start, end],
    () => insights.overview(params)
  );
  const overview = rawOverview || {};

  const maxStars = Math.max(...scores.map((u) => u?.total_stars || 0), 1);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">
          Insights & scoring
        </h1>
        <div className="flex gap-2">
          {['week', 'month', 'year', 'custom'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
                range === r
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <span className="text-sm text-slate-500">
          Showing data from {start} to {end} (PST)
        </span>
        {range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="custom-start-date">
              Start date:
            </label>
            <input
              id="custom-start-date"
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
            />
            <label className="text-sm font-medium text-slate-700" htmlFor="custom-end-date">
              End date:
            </label>
            <input
              id="custom-end-date"
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">
            Filter by task:
          </label>
          <select
            value={filterTask}
            onChange={(e) => setFilterTask(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All tasks</option>
            {taskList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Star className="w-6 h-6 text-amber-600 fill-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {overview?.totalStars ?? 0}
              </p>
              <p className="text-sm text-slate-500">Total stars earned</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {overview?.totalCompletions ?? 0}
              </p>
              <p className="text-sm text-slate-500">Tasks completed</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {scores.length}
              </p>
              <p className="text-sm text-slate-500">Active members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Member scores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Member scores
            </h2>
            <p className="text-sm text-slate-500">
              Stars earned per person in selected period
            </p>
          </div>
          <div className="p-6 space-y-4">
            {scores.map((u) => (
              <div key={u?.id} className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: u?.color || '#94a3b8' }}
                >
                  {u?.name?.charAt(0) || '?'}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-800">
                      {u?.name ?? 'Unknown'}
                    </span>
                    <span className="font-bold text-amber-600 flex items-center gap-1">
                      <Star className="w-4 h-4 fill-amber-500" />
                      {u?.total_stars ?? 0}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400"
                      style={{
                        width: `${((u?.total_stars ?? 0) / maxStars) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task counts */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-800">Task completion counts</h2>
            <p className="text-sm text-slate-500">
              Who did what and how many times in the selected period
            </p>
          </div>
          <div className="p-6 max-h-[400px] overflow-y-auto">
            {taskCounts.length === 0 ? (
              <p className="text-slate-500 text-sm">No completions in this period</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  taskCounts.reduce((acc, row) => {
                    const key = row?.task_title ?? 'Unknown';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(row);
                    return acc;
                  }, {})
                ).map(([taskTitle, rows]) => (
                  <div key={taskTitle} className="border-b border-slate-100 pb-4 last:border-0">
                    <p className="font-medium text-slate-800 mb-2">{taskTitle}</p>
                    <div className="space-y-1">
                      {rows.map((r) => (
                        <div key={`${r?.user_id}-${r?.task_title}`} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full shrink-0"
                              style={{ backgroundColor: r?.user_color || '#94a3b8' }}
                            />
                            <span className="text-slate-600">{r?.name ?? 'Unknown'}</span>
                          </div>
                          <span className="font-medium text-slate-800">
                            {r?.count ?? 0}×
                            {r?.total_stars > 0 && (
                              <span className="text-amber-600 ml-1">({r?.total_stars}★)</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top tasks */}
      {Array.isArray(overview?.topTasks) && overview.topTasks.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-800">Top tasks this period</h2>
            <p className="text-sm text-slate-500">Most frequently completed tasks</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {overview.topTasks.map((t, i) => (
                <div key={i} className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="font-medium text-slate-800 truncate" title={t?.title}>
                    {t?.title ?? 'Unknown'}
                  </p>
                  <p className="text-2xl font-bold text-sky-600 mt-1">{t?.completions ?? 0}</p>
                  <p className="text-xs text-slate-500 capitalize">{t?.task_type ?? ''}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
