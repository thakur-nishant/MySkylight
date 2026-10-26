import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { household as householdApi } from '../api';
import { UserPlus, Users, Crown, Copy, Check, Mail } from 'lucide-react';

const EMPTY_FORM = { name: '', email: '', color: '#6366f1' };

export default function HouseholdPage() {
  const { user } = useAuth();
  const isHead = user?.role === 'head';

  const { data: household, loading, error: loadError, refetch } = useQuery(
    'household',
    () => householdApi.get()
  );

  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    setInviteError('');
    setInviteResult(null);
    setCopied(false);
    setInviting(true);

    try {
      const result = await householdApi.invite(form);
      setInviteResult(result);
      setForm(EMPTY_FORM);
      try {
        await refetch();
      } catch {
        /* the member was created; the list will refresh on the next visit */
      }
    } catch (err) {
      setInviteError(err.message || 'Could not invite this member');
    } finally {
      setInviting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!inviteResult?.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(inviteResult.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the password is visible on screen */
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8">
        <div className="max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {loadError.message || 'Could not load your household'}
        </div>
      </div>
    );
  }

  const members = household?.members || [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-slate-800 dark:text-slate-100">
          {household?.name || 'Household'}
        </h1>
        <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
          {household?.head_name ? `Head of household: ${household.head_name}` : 'Household members'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Invite form (head of household only) */}
        {isHead && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-sky-600" />
              <h2 className="font-display font-semibold text-lg text-slate-800 dark:text-slate-100">
                Invite a member
              </h2>
            </div>
            <p className="text-sm text-slate-500 mb-4 dark:text-slate-400">
              We'll create an account for them with a temporary password, which is shown after
              inviting. They can sign in with it right away.
            </p>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={updateField('name')}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                  placeholder="Their name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={updateField('email')}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                  placeholder="them@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">
                  Color
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.color}
                    onChange={updateField('color')}
                    className="w-10 h-10 rounded cursor-pointer border border-slate-300 dark:border-slate-700"
                  />
                  <input
                    type="text"
                    value={form.color}
                    onChange={updateField('color')}
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {inviteError && (
                <div className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{inviteError}</div>
              )}

              {inviteResult && (
                <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg">
                  <p className="font-medium">
                    Account created for {inviteResult.user?.name || inviteResult.user?.email}.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-emerald-700">Temporary password:</span>
                    <code className="font-mono bg-white border border-emerald-200 rounded px-2 py-1">
                      {inviteResult.temporaryPassword}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={inviting}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
              >
                {inviting ? 'Creating account…' : 'Invite member'}
              </button>
            </form>
          </section>
        )}

        {/* Members list */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-sky-600" />
            <h2 className="font-display font-semibold text-lg text-slate-800 dark:text-slate-100">
              Members
            </h2>
            <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-3">
                {member.avatar ? (
                  <img src={member.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium shrink-0"
                    style={{ backgroundColor: member.color || '#6366f1' }}
                  >
                    {member.name?.charAt(0) || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 truncate dark:text-slate-100">
                      {member.name}
                    </p>
                    {member.role === 'head' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        <Crown className="w-3 h-3" />
                        Head
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 truncate flex items-center gap-1 dark:text-slate-400">
                    <Mail className="w-3.5 h-3.5" />
                    {member.email}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {!isHead && (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Only the head of household can invite new members.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
