import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Calendar, ListTodo, BarChart3, LogOut, ChevronsLeft, ChevronsRight, ClipboardCheck, KanbanSquare, Trophy, Sun, Users, UserRound } from 'lucide-react';
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
    { to: '/profile', icon: UserRound, label: 'Profile' },
  ];

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      <aside
        className={`sticky top-0 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ${
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
        <nav className="flex-1 p-2 space-y-1">
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
        <div className="mt-auto space-y-3 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <ThemeToggle compact={collapsed} />
          {!collapsed && <div className="mt-2"><GoogleCalendarIntegration /></div>}
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium"
                style={{ backgroundColor: user?.color || '#6366f1' }}
              >
                {user?.name?.charAt(0) || '?'}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate dark:text-slate-100">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={handleLogout}
              className="mt-3 w-full flex items-center gap-3 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}
