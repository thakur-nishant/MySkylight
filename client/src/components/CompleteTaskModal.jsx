import React, { useState, useEffect } from 'react';
import { completions } from '../api';

export default function CompleteTaskModal({
  task,
  users = [],
  currentUser,
  onClose,
  onComplete,
  existingCompletions = [], // all completions for this task
}) {
  const hasExisting = existingCompletions.length > 0;

  // Prefill selected users: existing completions OR default currentUser
  const defaultUserIds = hasExisting
    ? existingCompletions.map((c) => c.user_id)
    : currentUser
    ? [currentUser.id]
    : users.length > 0
    ? [users[0].id]
    : [];

  const [selectedUserIds, setSelectedUserIds] = useState(defaultUserIds);
  const [stars, setStars] = useState(
    hasExisting ? existingCompletions[0].stars_earned : task?.default_stars ?? 1
  );
  const [notes, setNotes] = useState(hasExisting ? existingCompletions[0].notes || '' : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Keep state in sync if dependencies change
  useEffect(() => {
    setSelectedUserIds(defaultUserIds);
    if (hasExisting) {
      setStars(existingCompletions[0].stars_earned);
      setNotes(existingCompletions[0].notes || '');
    } else {
      setStars(task?.default_stars ?? 1);
      setNotes('');
    }
  }, [existingCompletions, currentUser, users, hasExisting, task, defaultUserIds]);

  const handleUserChange = (e) => {
    const options = Array.from(e.target.selectedOptions).map((opt) => parseInt(opt.value));
    setSelectedUserIds(options.filter((id) => !isNaN(id)));
  };

  /** Submit: create new completions or update existing ones */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (selectedUserIds.length === 0) {
        setError('Please select at least one user');
        setSaving(false);
        return;
      }
  
      const existingUserIds = existingCompletions.map((c) => c.user_id);
  
      // 1. Delete completions for unselected users
      const removedUserIds = existingUserIds.filter((uid) => !selectedUserIds.includes(uid));
      for (const uid of removedUserIds) {
        const c = existingCompletions.find((c) => c.user_id === uid);
        if (c) await completions.delete(c.id);
      }
  
      // 2. Update existing completions
      const toUpdate = [];
      const toCreateUserIds = [];
  
      selectedUserIds.forEach((uid) => {
        const existing = existingCompletions.find((c) => c.user_id === uid);
        if (existing) {
          toUpdate.push({
            id: existing.id,
            stars_earned: stars,
            notes: notes || null,
            user_id: uid,
          });
        } else {
          toCreateUserIds.push(uid);
        }
      });
      if (toUpdate.length > 0) {
        await completions.update({
          updates: toUpdate,
          task_id: task.id,
        });
      }
  
      // 3. Create new completions
      if (toCreateUserIds.length > 0) {
        await completions.create({
          task_id: task.id,
          user_ids: toCreateUserIds,
          stars_earned: stars,
          notes: notes || null,
        });
      }
  
      onComplete?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to save completion');
    } finally {
      setSaving(false);
    }
  };
  

  /** Mark as undone */
  const handleMarkUndone = async () => {
    if (selectedUserIds.length === 0) return;
    setSaving(true);

    try {
      const toDelete = existingCompletions.filter((c) => selectedUserIds.includes(c.user_id));
      await Promise.all(toDelete.map((c) => completions.delete(c.id)));
      onComplete?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to mark as undone');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <h2 className="font-display font-bold text-xl">{task?.title}</h2>
          <p className="text-slate-600 mt-1">{hasExisting ? 'Update completion' : 'Mark task as done'}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Users */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Completed by</label>
            <select
              multiple
              value={selectedUserIds}
              onChange={handleUserChange}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
              size={Math.min(5, users.length)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stars */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Stars earned</label>
            <input
              type="number"
              min={0}
              max={10}
              value={stars}
              onChange={(e) => setStars(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500"
              rows={2}
              placeholder="Any notes about this completion..."
            />
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</div>}

          {/* Footer */}
          <div className="flex justify-between pt-2">
            {hasExisting && (
              <button
                type="button"
                onClick={handleMarkUndone}
                disabled={saving}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Processing…' : 'Mark as Undone'}
              </button>
            )}

            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving…' : hasExisting ? 'Update Done' : 'Mark Done'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
