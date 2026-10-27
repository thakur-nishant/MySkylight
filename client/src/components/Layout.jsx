import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Calendar, ListTodo, BarChart3, LogOut, ChevronsLeft, ChevronsRight, ClipboardCheck, KanbanSquare, Trophy, Sun, Users } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import GoogleCalendarIntegration from './GoogleCalendarIntegration';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false); // Sidebar collapsed state

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSidebar = () => setCollapsed(!collapsed);

  const navItems = [
    { to: '/today', icon: Sun, label: 'Today' },
    { to: '/calendar', icon: Calendar, label: 'Calendar' },
    { to: '/tasks', icon: ListTodo, label: 'Tasks' },
    { to: '/projects', icon: KanbanSquare, label: 'Project Dashboard' },
    { to: '/personal-tracker', icon: ClipboardCheck, label: 'Personal Tracker' },
    { to: '/challenge-tracker', icon: Trophy, label: 'Challenge Tracker' },
    { to: '/insights', icon: BarChart3, label: 'Insights' },
    { to: '/household', icon: Users, label: 'Household' },
  ];

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      <aside
        className={`sticky top-0 h-screen min-h-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b border-slate-200`}>
          {!collapsed && (
            <div>
              <h1 className="font-display font-bold text-xl text-sky-600">MySkylight</h1>
              <p className="text-sm text-slate-500 mt-1 truncate">{user?.household_name || 'Calendar & tasks'}</p>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 rounded hover:bg-slate-100 transition-colors"
          >
            {collapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="mt-auto shrink-0 space-y-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <NavLink
              to="/profile"
              title={collapsed ? `${user?.name || 'Profile'} profile` : undefined}
              aria-label={collapsed ? `Open ${user?.name || 'user'} profile` : undefined}
              className={`flex min-w-0 items-center gap-3 rounded-lg p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${collapsed ? 'justify-center' : 'flex-1'}`}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                  style={{ backgroundColor: user?.color || '#6366f1' }}
                >
                  {user?.name?.charAt(0) || '?'}
                </div>
              )}
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">{user?.name}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                </div>
              )}
            </NavLink>
          </div>

          <button
            onClick={handleLogout}
            title={collapsed ? 'Sign out' : undefined}
            aria-label="Sign out"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
          <ThemeToggle compact={collapsed} />
          {!collapsed && <div className="pt-1"><GoogleCalendarIntegration /></div>}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}
