import React, { useState, useEffect } from 'react';
import { tasks as tasksApi } from '../api';
import { zonedTimeToUtc, formatDatePST } from '../utils/dateUtils';

const cleanPayload = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );


export default function TaskModal({ task, users, projects = [], onClose, initialDate, initialProjectId = '' }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('daily');
  const [defaultStars, setDefaultStars] = useState(1);
  const [isGroupTask, setIsGroupTask] = useState(false);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Initialize form values from task or initialDate
  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setTaskType(task.task_type || 'daily');
      setDefaultStars(task.default_stars ?? 1);
      setIsGroupTask(!!task.is_group_task);
      setAssignedUserIds(task.assigned_user_ids || []);
      setDueDate(task.due_date ? formatDatePST(task.due_date) : '');
      setProjectId(task.project_id ? String(task.project_id) : '');
    } else if (initialDate) {
      // If creating from calendar click
      setTaskType('event');
      setDueDate(formatDatePST(initialDate));
      setProjectId(initialProjectId ? String(initialProjectId) : '');
    } else {
      setProjectId(initialProjectId ? String(initialProjectId) : '');
    }
  }, [task, initialDate, initialProjectId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      // ---- validation (UI-level) ----
      if (!title.trim()) {
        setError('Title is required');
        setSaving(false);
        return;
      }

      if (
        (taskType === 'one-time' || taskType === 'event') &&
        !dueDate
      ) {
        setError('Date is required for this task type');
        setSaving(false);
        return;
      }

      // ---- build payload ----
      const rawData = {
        title: title.trim(),
        description: description?.trim() || null,
        task_type: taskType,
        default_stars: defaultStars,
        is_group_task: isGroupTask,
        assigned_user_ids: assignedUserIds.length ? assignedUserIds : null,
        due_date:
          (taskType === 'one-time' || taskType === 'event') && dueDate
            ? zonedTimeToUtc(dueDate)
            : null,
        project_id: projectId ? Number(projectId) : null,
      };

      // ---- strip undefined ----
      const data = cleanPayload(rawData);

      if (task) {
        await tasksApi.update(task.id, data);
      } else {
        await tasksApi.create(data);
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !deleteConfirm) return;

    setSaving(true);
    try {
      await tasksApi.delete(task.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete task');
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = (id) => {
    setAssignedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h2 className="font-display font-bold text-xl">
            {task ? 'Edit task' : 'New task'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Type & Stars */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="one-time">One-time</option>
                <option value="event">Event</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stars reward</label>
              <input
                type="number"
                min={0}
                max={10}
                value={defaultStars}
                onChange={(e) => setDefaultStars(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Due Date */}
          {(taskType === 'one-time' || taskType === 'event') && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due date (PST)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Appears on the calendar on this PST date
              </p>
            </div>
          )}

          {/* Group task */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isGroupTask}
              onChange={(e) => setIsGroupTask(e.target.checked)}
              className="rounded border-slate-300 text-sky-600"
            />
            Group task (can be done together)
          </label>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
            >
              <option value="">No project</option>
              {(projects || []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned users */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Assigned to (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {(users || []).map((u) => (
                <label
                  key={u.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer border ${
                    assignedUserIds.includes(u.id)
                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={assignedUserIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="sr-only"
                  />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: u.color }} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-4">
            <div>
              {task && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(!deleteConfirm)}
                  className={`text-sm ${deleteConfirm ? 'text-red-600 font-medium' : 'text-slate-500'}`}
                >
                  {deleteConfirm ? 'Click again to confirm delete' : 'Delete task'}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>

              {task && deleteConfirm ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                >
                  Delete
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving…' : task ? 'Save' : 'Create'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
