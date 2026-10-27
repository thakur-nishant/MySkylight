import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, LockKeyhole, UserRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const MAX_PHOTO_BYTES = 1024 * 1024;

export default function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth();
  const photoInput = useRef(null);
  const [name, setName] = useState(user?.name || '');
  const [color, setColor] = useState(user?.color || '#6366f1');
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setColor(user?.color || '#6366f1');
    setAvatar(user?.avatar || null);
  }, [user]);

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Profile photos must be smaller than 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result);
      setError('');
      setSaved(false);
    };
    reader.onerror = () => setError('Could not read that image. Please try another file.');
    reader.readAsDataURL(file);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateProfile({ name, color, avatar });
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const closePasswordDialog = () => {
    setShowPasswordDialog(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      setPasswordChanged(true);
      closePasswordDialog();
    } catch (changeError) {
      setPasswordError(changeError.message || 'Could not update your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-full p-6 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-medium text-sky-600 dark:text-sky-400">ACCOUNT</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-slate-800 dark:text-slate-100">
            Your profile
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            Manage how you appear to your household.
          </p>
        </header>

        <form onSubmit={handleSave} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <section className="border-b border-slate-100 p-6 sm:p-8 dark:border-slate-800">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="relative h-24 w-24 shrink-0">
                {avatar ? (
                  <img src={avatar} alt={`${name || 'Profile'} profile`} className="h-24 w-24 rounded-full object-cover ring-4 ring-slate-50 dark:ring-slate-800" />
                ) : (
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold text-white ring-4 ring-slate-50 dark:ring-slate-800"
                    style={{ backgroundColor: color }}
                  >
                    {name.trim().charAt(0).toUpperCase() || <UserRound className="h-9 w-9" />}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  aria-label="Change profile photo"
                  className="absolute bottom-0 right-0 rounded-full border-2 border-white bg-sky-600 p-2 text-white shadow-sm transition hover:bg-sky-700 dark:border-slate-900"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Profile photo
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Choose a square photo up to 1 MB. PNG, JPEG, or WebP.
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => photoInput.current?.click()}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Upload photo
                  </button>
                  {avatar && (
                    <button
                      type="button"
                      onClick={() => { setAvatar(null); setSaved(false); }}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <X className="h-4 w-4" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 p-6 sm:p-8">
            <div>
              <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Display name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(event) => { setName(event.target.value); setSaved(false); }}
                maxLength={80}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:text-slate-100"
                placeholder="Your name"
              />
            </div>

            <div>
              <label htmlFor="profile-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email address
              </label>
              <div className="relative">
                <input
                  id="profile-email"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  aria-describedby="email-note"
                  className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 pr-11 text-slate-500 outline-none dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-500"
                />
                <LockKeyhole className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <p id="email-note" className="mt-1.5 text-xs text-slate-400">
                Your email is linked to your account and can’t be changed.
              </p>
            </div>

            <div>
              <label htmlFor="profile-color" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Profile color
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="profile-color"
                  type="color"
                  value={color}
                  onChange={(event) => { setColor(event.target.value); setSaved(false); }}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 p-1 dark:border-slate-700"
                  aria-label="Choose profile color"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Used as the background when you don’t have a photo.
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Password</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Update your password using your current password.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPasswordChanged(false);
                  setPasswordError('');
                  setShowPasswordDialog(true);
                }}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Change password
              </button>
              {passwordChanged && (
                <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
                  Password updated successfully.
                </p>
              )}
            </div>
          </section>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-slate-800 dark:bg-slate-950/40">
            <div aria-live="polite" className="text-sm">
              {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
              {saved && !error && (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  Profile saved
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </footer>
        </form>

        {showPasswordDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <form
              onSubmit={handlePasswordChange}
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 id="change-password-title" className="text-xl font-bold text-slate-800 dark:text-slate-100">
                    Change password
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Enter your current password, then choose a new one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePasswordDialog}
                  disabled={changingPassword}
                  aria-label="Close change password dialog"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Current password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    autoFocus
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={8}
                    required
                    aria-describedby="new-password-hint"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <p id="new-password-hint" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Use at least 8 characters.
                  </p>
                </div>
                <div>
                  <label htmlFor="confirm-new-password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              {passwordError && (
                <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
                  {passwordError}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closePasswordDialog}
                  disabled={changingPassword}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {changingPassword ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
