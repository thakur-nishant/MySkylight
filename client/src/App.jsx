import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import CalendarPage from './pages/CalendarPage';
import TasksPage from './pages/TasksPage';
import InsightsPage from './pages/InsightsPage';
import PersonalTrackerPage from './pages/PersonalTrackerPage';
import ProjectDashboardPage from './pages/ProjectDashboardPage';
import ChallengeTrackerPage from './pages/ChallengeTrackerPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return children;
}


function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/calendar" replace />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="projects" element={<ProjectDashboardPage />} />
        <Route path="personal-tracker" element={<PersonalTrackerPage />} />
        <Route path="challenge-tracker" element={<ChallengeTrackerPage />} />
        <Route path="insights" element={<InsightsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
