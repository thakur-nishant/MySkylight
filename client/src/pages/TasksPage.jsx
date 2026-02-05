import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { tasks as tasksApi, users, completions } from '../api';
import { Plus, Check, Star, Filter, ChevronDown } from 'lucide-react';
import TaskModal from '../components/TaskModal';
import CompleteTaskModal from '../components/CompleteTaskModal';
import { formatDatePST } from '../utils/dateUtils'; // centralized date formatting

export default function TasksPage() {
  const { user } = useAuth();
  const [filterUser, setFilterUser] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [completingTask, setCompletingTask] = useState(null);
  const [dateFilter, setDateFilter] = useState('');

  const params = {};
  if (filterUser === 'unassigned') params.assigned_to = 'unassigned';
  else if (filterUser !== 'all') params.assigned_to = filterUser;
  if (filterType !== 'all') params.type = filterType;

  const { data: taskList = [], refetch: refetchTasks, isLoading: tasksLoading } = useQuery(
    ['tasks', filterUser, filterType],
    () => tasksApi.list(params)
  );

  const { data: userList = [], refetch: refetchUsers, isLoading: usersLoading } = useQuery(
    ['users'],
    () => users.list()
  );

  const { data: completionList = [], refetch: refetchCompletions, isLoading: completionsLoading } = useQuery(
    ['completions', dateFilter],
    () => {
      const p = {};
      if (dateFilter) {
        const parts = dateFilter.split(' to ').map((s) => s.trim());
        if (parts[0]) p.start_date = parts[0];
        if (parts[1]) p.end_date = parts[1];
      }
      return completions.list(p);
    }
  );

  const isLoading = tasksLoading || usersLoading || completionsLoading;

  const refetch = () => {
    refetchTasks?.();
    refetchCompletions?.();
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleComplete = (task) => {
    setCompletingTask(task);
  };

  const handleCloseTaskModal = () => {
    setShowTaskModal(false);
    setEditingTask(null);
    refetch();
  };

  const handleCloseCompleteModal = () => {
    setCompletingTask(null);
    refetch();
  };

  const getAssignedNames = (task) => {
    if (!task.assigned_user_ids?.length) return 'Unassigned';
    return task.assigned_user_ids
      .map((uid) => userList?.find((u) => u.id === uid)?.name)
      .filter(Boolean)
      .join(', ');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800">Tasks</h1>
        <button
          onClick={() => {
            setEditingTask(null);
            setShowTaskModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add task
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 p-4 bg-white rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filter by user:</span>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            {(userList || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Type:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">All</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="one-time">One-time</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-800">Task list</h2>
            <p className="text-sm text-slate-500">Click to complete or edit</p>
          </div>
          <ul className="divide-y divide-slate-200 max-h-[500px] overflow-y-auto">
            {(taskList || []).map((task) => (
              <li
                key={task.id}
                className="px-6 py-4 hover:bg-slate-50 flex items-center justify-between gap-4 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600"
                    >
                      {task.task_type}
                    </span>
                    {task.is_group_task && (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                        Group
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-slate-800 mt-1">{task.title}</h3>
                  <p className="text-sm text-slate-500">{getAssignedNames(task)}</p>
                  {task.default_stars > 0 && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-500" />
                      {task.default_stars} star{task.default_stars > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleComplete(task)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                    title="Mark complete"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleEdit(task)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    title="Edit"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-800">Recent completions</h2>
            <p className="text-sm text-slate-500">Tasks completed by household members</p>
            <div className="mt-2">
              <input
                type="text"
                placeholder="Filter by date range (YYYY-MM-DD to YYYY-MM-DD)"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
          </div>
          <ul className="divide-y divide-slate-200 max-h-[500px] overflow-y-auto">
            {(completionList || []).slice(0, 30).map((c) => (
              <li key={c.id} className="px-6 py-3 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
                  style={{ backgroundColor: c.user_color || '#94a3b8' }}
                >
                  {c.user_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{c.task_title}</p>
                  <p className="text-sm text-slate-500">
                    {c.user_name} • {formatDatePST(c.completed_at, 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <Star className="w-4 h-4 fill-amber-500" />
                  {c.stars_earned}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {showTaskModal && (
        <TaskModal
          task={editingTask}
          users={userList || []}
          onClose={handleCloseTaskModal}
        />
      )}

      {completingTask && (
        <CompleteTaskModal
          task={completingTask}
          users={userList || []}
          currentUser={user}
          onClose={handleCloseCompleteModal}
        />
      )}
    </div>
  );
}
