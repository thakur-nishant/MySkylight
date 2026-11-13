import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Home,
  KanbanSquare,
  KeyRound,
  ListTodo,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { admin as adminApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';

const EMPTY_HOUSEHOLD = { household_name: '', name: '', email: '', color: '#6366f1' };
const EMPTY_MEMBER = { name: '', email: '', color: '#6366f1' };
const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirmPassword: '' };

function formatDate(value) {
  if (!value) return '—';
  const raw = String(value);
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{value ?? 0}</p>
    </div>
  );
}

function RoleBadge({ role }) {
  if (role === 'head') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <Crown className="h-3 w-3" />
        Head
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      Member
    </span>
  );
}

function MemberAvatar({ member }) {
  if (member.avatar) {
    return <img src={member.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
      style={{ backgroundColor: member.color || '#6366f1' }}
    >
      {member.name?.charAt(0) || '?'}
    </div>
  );
}

function Modal({ title, description, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-modal-title" className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ htmlFor, label, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

const secondaryButtonClass =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminPage() {
  const { user, logout, changePassword } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [households, setHouseholds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_HOUSEHOLD);
  const [createError, setCreateError] = useState('');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER);
  const [memberError, setMemberError] = useState('');

  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD);
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const loadConsole = async (preferredId, { initial = false } = {}) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const [stats, list] = await Promise.all([adminApi.overview(), adminApi.households()]);
      setOverview(stats);
      setHouseholds(list);

      let nextId;
      if (preferredId !== undefined) {
        nextId = preferredId;
      } else if (list.some((household) => household.id === selectedId)) {
        nextId = selectedId;
      } else {
        nextId = list[0]?.id ?? null;
      }

      setSelectedId(nextId);
      if (nextId) {
        setSelected(await adminApi.household(nextId));
      } else {
        setSelected(null);
      }
    } catch (err) {
      setError(err.message || 'Could not load the admin console');
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    loadConsole(undefined, { initial: true });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const selectHousehold = async (id) => {
    const summary = households.find((household) => household.id === id) || null;
    setSelectedId(id);
    setSelected(summary ? { ...summary, members: [] } : null);
    setError('');

    try {
      setSelected(await adminApi.household(id));
    } catch (err) {
      setError(err.message || 'Could not load that household');
    }
  };

  const openCreate = () => {
    setCreateForm(EMPTY_HOUSEHOLD);
    setCreateError('');
    setCreateOpen(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateError('');
    setBusy(true);

    try {
      const result = await adminApi.createHousehold(createForm);
      setCreateOpen(false);
      setCreateForm(EMPTY_HOUSEHOLD);
      setNotice(`Created ${result.household.name}.`);
      setCredentials({
        title: 'Household created',
        name: result.user?.name,
        email: result.user?.email,
        password: result.temporaryPassword,
      });
      await loadConsole(result.household.id);
    } catch (err) {
      setCreateError(err.message || 'Could not create the household');
    } finally {
      setBusy(false);
    }
  };

  const openRename = () => {
    setRenameName(selected?.name || '');
    setRenameError('');
    setRenameOpen(true);
  };

  const handleRename = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setRenameError('');
    setBusy(true);

    try {
      await adminApi.updateHousehold(selected.id, { name: renameName });
      setRenameOpen(false);
      setNotice('Household renamed.');
      await loadConsole(selected.id);
    } catch (err) {
      setRenameError(err.message || 'Could not rename the household');
    } finally {
      setBusy(false);
    }
  };

  const openAddMember = () => {
    setMemberForm(EMPTY_MEMBER);
    setMemberError('');
    setMemberOpen(true);
  };

  const handleAddMember = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setMemberError('');
    setBusy(true);

    try {
      const result = await adminApi.addMember(selected.id, memberForm);
      setMemberOpen(false);
      setMemberForm(EMPTY_MEMBER);
      setNotice(`Added ${result.user.name}.`);
      setCredentials({
        title: 'Member added',
        name: result.user.name,
        email: result.user.email,
        password: result.temporaryPassword,
      });
      await loadConsole(selected.id);
    } catch (err) {
      setMemberError(err.message || 'Could not add the member');
    } finally {
      setBusy(false);
    }
  };

  const handlePromote = async (member) => {
    if (!selected) return;
    if (!window.confirm(`Make ${member.name} the head of ${selected.name}? The current head will become a member.`)) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await adminApi.updateMember(member.id, { role: 'head' });
      setNotice(`${member.name} is now the head of ${selected.name}.`);
      await loadConsole(selected.id);
    } catch (err) {
      setError(err.message || 'Could not change that member’s role');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (member) => {
    if (!window.confirm(`Generate a new temporary password for ${member.name}? Their current password will stop working.`)) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await adminApi.resetMemberPassword(member.id);
      setCredentials({
        title: 'Temporary password',
        name: result.user.name,
        email: result.user.email,
        password: result.temporaryPassword,
      });
    } catch (err) {
      setError(err.message || 'Could not reset that password');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selected) return;
    if (member.role === 'head') {
      setError('Promote another member to head before removing the current head.');
      return;
    }
    if (!window.confirm(`Remove ${member.name} (${member.email}) from ${selected.name}? This deletes their account and personal data.`)) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await adminApi.deleteMember(member.id);
      setNotice(`Removed ${member.name}.`);
      await loadConsole(selected.id);
    } catch (err) {
      setError(err.message || 'Could not remove that member');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHousehold = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"? This permanently deletes all members, tasks, projects, challenges, and history for this household.`)) {
      return;
    }

    const deletedName = selected.name;
    setBusy(true);
    setError('');
    setSelected(null);
    setSelectedId(null);
    try {
      await adminApi.deleteHousehold(selected.id);
      setNotice(`Deleted ${deletedName}.`);
      await loadConsole(undefined);
    } catch (err) {
      setError(err.message || 'Could not delete that household');
      await loadConsole(undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!credentials?.password) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the password is visible on screen */
    }
  };

  const openPassword = () => {
    setPasswordForm(EMPTY_PASSWORD);
    setPasswordError('');
    setPasswordOpen(true);
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(passwordForm);
      setPasswordOpen(false);
      setPasswordForm(EMPTY_PASSWORD);
      setNotice('Admin password updated.');
    } catch (err) {
      setPasswordError(err.message || 'Could not update your password');
    } finally {
      setChangingPassword(false);
    }
  };

  const query = search.trim().toLowerCase();
  const filteredHouseholds = query
    ? households.filter((household) =>
        [household.name, household.head_name, household.head_email]
          .some((value) => (value || '').toLowerCase().includes(query))
      )
    : households;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-sky-500">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
                Platform admin
              </p>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
                MySkylight Admin
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
              {user?.email}
            </span>
            <ThemeToggle compact />
            <button type="button" onClick={openPassword} className={secondaryButtonClass}>
              <KeyRound className="h-4 w-4" />
              Change password
            </button>
            <button type="button" onClick={handleLogout} className={secondaryButtonClass}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Households
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage every household and its members from one place.
            </p>
          </div>
          <button type="button" onClick={() => loadConsole(selectedId)} disabled={refreshing} className={secondaryButtonClass}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard icon={Home} label="Households" value={overview?.households ?? 0} />
              <StatCard icon={Users} label="Members" value={overview?.members ?? 0} />
              <StatCard icon={ListTodo} label="Tasks" value={overview?.tasks ?? 0} />
              <StatCard icon={KanbanSquare} label="Projects" value={overview?.projects ?? 0} />
              <StatCard icon={Trophy} label="Challenges" value={overview?.challenges ?? 0} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                      All households
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {households.length} total
                    </p>
                  </div>
                  <button type="button" onClick={openCreate} className={primaryButtonClass}>
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                </div>

                <div className="border-b border-slate-100 p-3 dark:border-slate-800">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search households or heads"
                      className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>

                <ul className="max-h-[28rem] overflow-y-auto lg:max-h-[calc(100vh-24rem)]">
                  {filteredHouseholds.map((household) => {
                    const active = household.id === selectedId;
                    return (
                      <li key={household.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => selectHousehold(household.id)}
                          disabled={busy}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed ${
                            active
                              ? 'bg-sky-50 dark:bg-sky-950/40'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              active
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            <Home className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate font-medium ${active ? 'text-sky-900 dark:text-sky-100' : 'text-slate-800 dark:text-slate-100'}`}>
                              {household.name}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {household.head_name || 'No head'} · {household.member_count}{' '}
                              {household.member_count === 1 ? 'member' : 'members'}
                            </p>
                          </div>
                          <ChevronRight className={`h-4 w-4 shrink-0 ${active ? 'text-sky-600' : 'text-slate-400'}`} />
                        </button>
                      </li>
                    );
                  })}

                  {!filteredHouseholds.length && (
                    <li className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      {households.length
                        ? 'No households match your search.'
                        : 'No households yet. Create the first one.'}
                    </li>
                  )}
                </ul>
              </section>

              {selected ? (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {selected.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {selected.member_count}{' '}
                          {selected.member_count === 1 ? 'member' : 'members'} · Created{' '}
                          {formatDate(selected.created_at)}
                        </p>
                        {selected.head_name && (
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Head:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {selected.head_name}
                            </span>
                            {selected.head_email ? ` · ${selected.head_email}` : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={openRename} className={secondaryButtonClass}>
                          <Pencil className="h-4 w-4" />
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteHousehold}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <MiniStat label="Tasks" value={selected.task_count} />
                      <MiniStat label="Projects" value={selected.project_count} />
                      <MiniStat label="Challenges" value={selected.challenge_count} />
                      <MiniStat label="Members" value={selected.member_count} />
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
                          Members
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Reset a password, change the head, or remove an account.
                        </p>
                      </div>
                      <button type="button" onClick={openAddMember} disabled={busy} className={primaryButtonClass}>
                        <UserPlus className="h-4 w-4" />
                        Add member
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[42rem] text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                            <th className="px-2 py-2 font-medium">Member</th>
                            <th className="px-2 py-2 font-medium">Role</th>
                            <th className="px-2 py-2 font-medium">Joined</th>
                            <th className="px-2 py-2 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selected.members || []).map((member) => (
                            <tr key={member.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                              <td className="px-2 py-3">
                                <div className="flex items-center gap-3">
                                  <MemberAvatar member={member} />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                                      {member.name}
                                    </p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                      {member.email}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-3">
                                <RoleBadge role={member.role} />
                              </td>
                              <td className="px-2 py-3 text-slate-500 dark:text-slate-400">
                                {formatDate(member.created_at)}
                              </td>
                              <td className="px-2 py-3">
                                <div className="flex flex-wrap justify-end gap-1">
                                  {member.role !== 'head' && (
                                    <button
                                      type="button"
                                      onClick={() => handlePromote(member)}
                                      disabled={busy}
                                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
                                    >
                                      <Crown className="h-3.5 w-3.5" />
                                      Make head
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleResetPassword(member)}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    <KeyRound className="h-3.5 w-3.5" />
                                    Reset password
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(member)}
                                    disabled={busy || member.role === 'head'}
                                    title={member.role === 'head' ? 'Promote another member to head first' : undefined}
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}

                          {!(selected.members || []).length && (
                            <tr>
                              <td colSpan={4} className="px-2 py-8 text-center text-slate-500 dark:text-slate-400">
                                This household has no members. Add one to get started.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="flex min-h-[20rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                  <div>
                    <Home className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <h3 className="mt-3 font-display text-lg font-semibold text-slate-800 dark:text-slate-100">
                      No household selected
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Select a household to view and manage its members.
                    </p>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </main>

      {createOpen && (
        <Modal
          title="Create household"
          description="Add a household and its first head account."
          onClose={() => !busy && setCreateOpen(false)}
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <Field htmlFor="admin-household-name" label="Household name">
              <input
                id="admin-household-name"
                type="text"
                value={createForm.household_name}
                onChange={(event) => setCreateForm((current) => ({ ...current, household_name: event.target.value }))}
                required
                maxLength={80}
                autoFocus
                placeholder="e.g. The Sharma Family"
                className={inputClass}
              />
            </Field>
            <Field htmlFor="admin-head-name" label="Head name">
              <input
                id="admin-head-name"
                type="text"
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                required
                maxLength={80}
                placeholder="Their name"
                className={inputClass}
              />
            </Field>
            <Field htmlFor="admin-head-email" label="Head email">
              <input
                id="admin-head-email"
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                required
                placeholder="them@example.com"
                className={inputClass}
              />
            </Field>
            <Field htmlFor="admin-head-color" label="Color">
              <div className="flex items-center gap-2">
                <input
                  id="admin-head-color"
                  type="color"
                  value={createForm.color}
                  onChange={(event) => setCreateForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 p-1 dark:border-slate-700"
                />
                <input
                  type="text"
                  value={createForm.color}
                  onChange={(event) => setCreateForm((current) => ({ ...current, color: event.target.value }))}
                  className={inputClass}
                  aria-label="Color hex value"
                />
              </div>
            </Field>

            {createError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {createError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} disabled={busy} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>
                {busy ? 'Creating…' : 'Create household'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {renameOpen && (
        <Modal
          title="Rename household"
          description="The household name is visible to all of its members."
          onClose={() => !busy && setRenameOpen(false)}
        >
          <form onSubmit={handleRename} className="space-y-4">
            <Field htmlFor="admin-rename" label="Household name">
              <input
                id="admin-rename"
                type="text"
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                required
                maxLength={80}
                autoFocus
                className={inputClass}
              />
            </Field>

            {renameError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {renameError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setRenameOpen(false)} disabled={busy} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !renameName.trim()} className={primaryButtonClass}>
                {busy ? 'Saving…' : 'Save name'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {memberOpen && (
        <Modal
          title="Add member"
          description="Create an account in this household with a temporary password."
          onClose={() => !busy && setMemberOpen(false)}
        >
          <form onSubmit={handleAddMember} className="space-y-4">
            <Field htmlFor="admin-member-name" label="Name">
              <input
                id="admin-member-name"
                type="text"
                value={memberForm.name}
                onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
                required
                maxLength={80}
                autoFocus
                placeholder="Their name"
                className={inputClass}
              />
            </Field>
            <Field htmlFor="admin-member-email" label="Email">
              <input
                id="admin-member-email"
                type="email"
                value={memberForm.email}
                onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
                required
                placeholder="them@example.com"
                className={inputClass}
              />
            </Field>
            <Field htmlFor="admin-member-color" label="Color">
              <div className="flex items-center gap-2">
                <input
                  id="admin-member-color"
                  type="color"
                  value={memberForm.color}
                  onChange={(event) => setMemberForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 p-1 dark:border-slate-700"
                />
                <input
                  type="text"
                  value={memberForm.color}
                  onChange={(event) => setMemberForm((current) => ({ ...current, color: event.target.value }))}
                  className={inputClass}
                  aria-label="Color hex value"
                />
              </div>
            </Field>

            {memberError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {memberError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setMemberOpen(false)} disabled={busy} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>
                {busy ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {credentials && (
        <Modal
          title={credentials.title}
          description="This password is shown once. Share it securely."
          onClose={() => setCredentials(null)}
        >
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              {credentials.name || 'Account'}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{credentials.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-sm text-emerald-900 dark:border-emerald-900 dark:bg-slate-950 dark:text-emerald-100">
                {credentials.password}
              </code>
              <button type="button" onClick={handleCopy} className={secondaryButtonClass}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            The account can change this password after signing in.
          </p>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => setCredentials(null)} className={primaryButtonClass}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {passwordOpen && (
        <Modal
          title="Change admin password"
          description="Use the temporary password as your current password, then choose a new one."
          onClose={() => !changingPassword && setPasswordOpen(false)}
        >
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Field htmlFor="admin-current-password" label="Current password">
              <input
                id="admin-current-password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                required
                autoFocus
                className={inputClass}
              />
            </Field>
            <Field htmlFor="admin-new-password" label="New password">
              <input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                minLength={8}
                required
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use at least 8 characters.</p>
            </Field>
            <Field htmlFor="admin-confirm-password" label="Confirm new password">
              <input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                minLength={8}
                required
                className={inputClass}
              />
            </Field>

            {passwordError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {passwordError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                disabled={changingPassword}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button type="submit" disabled={changingPassword} className={primaryButtonClass}>
                {changingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
