import React, { useEffect, useState } from 'react';

const EMPTY_EDIT_FORM = {
  due_date: '',
  assigned_user_ids: [],
  project_id: '',
};

export default function EditTaskModal({ task, users, projects, onClose, onSave, onDelete, saving, error }) {
  const [form, setForm] = useState(EMPTY_EDIT_FORM);

  useEffect(() => {
    if (!task) return;
    setForm({
      due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
      assigned_user_ids: Array.isArray(task.assigned_user_ids) ? task.assigned_user_ids : [],
      project_id: task.project_id ? String(task.project_id) : '',
    });
  }, [task]);

  if (!task) return null;

  const toggleAssignee = (userId) => {
    setForm((prev) => ({
      ...prev,
      assigned_user_ids: prev.assigned_user_ids.includes(userId)
        ? prev.assigned_user_ids.filter((id) => id !== userId)
        : [...prev.assigned_user_ids, userId],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-display text-xl font-bold text-slate-800">Edit task</h2>
          <p className="text-sm text-slate-500 mt-1">{task.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-sm text-slate-700 block mb-1">Due date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="text-sm text-slate-700 block mb-2">Assignee</label>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => (
                <label
                  key={user.id}
                  className={`px-3 py-1 rounded-full border cursor-pointer ${
                    form.assigned_user_ids.includes(user.id)
                      ? 'bg-sky-50 border-sky-400 text-sky-700'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.assigned_user_ids.includes(user.id)}
                    onChange={() => toggleAssignee(user.id)}
                  />
                  {user.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-700 block mb-1">Move to project</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm((prev) => ({ ...prev, project_id: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              disabled={saving}
              className="px-3 py-2 text-red-700 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Delete task
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-slate-600 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
