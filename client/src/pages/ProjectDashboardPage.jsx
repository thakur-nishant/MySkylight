import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { projects as projectsApi, tasks as tasksApi, users as usersApi } from '../api';
import { useQuery } from '../hooks/useQuery';
import { WORKFLOW_COLUMNS, WORKFLOW_STATUSES } from '../constants/workflow';
import KanbanColumn from '../components/projects/KanbanColumn';
import EditTaskModal from '../components/projects/EditTaskModal';

const EMPTY_TASK_FORM = { title: '', due_date: '', assigned_user_ids: [] };

export default function ProjectDashboardPage() {
  const [activeProjectId, setActiveProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newTask, setNewTask] = useState(EMPTY_TASK_FORM);
  const [error, setError] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [isTaskActionLoading, setIsTaskActionLoading] = useState(false);

  const { data: projectsData, refetch: refetchProjects, isLoading: projectsLoading } = useQuery(
    ['projects'],
    () => projectsApi.list({ include_archived: '1' })
  );
  const { data: usersData, isLoading: usersLoading } = useQuery(['users'], () => usersApi.list());
  const { data: tasksData, refetch: refetchTasks, isLoading: tasksLoading } = useQuery(
    ['tasks', activeProjectId],
    () => tasksApi.list(activeProjectId ? { project_id: activeProjectId } : undefined)
  );

  const projects = Array.isArray(projectsData) ? projectsData : [];
  const activeProjects = useMemo(() => projects.filter((project) => !project.is_archived), [projects]);
  const archivedProjects = useMemo(() => projects.filter((project) => project.is_archived), [projects]);
  const users = Array.isArray(usersData) ? usersData : [];
  const tasks = Array.isArray(tasksData) ? tasksData : [];

  const isLoading = projectsLoading || usersLoading || tasksLoading;

  const selectedProject = useMemo(
    () => activeProjects.find((project) => String(project.id) === String(activeProjectId)) || activeProjects[0],
    [activeProjects, activeProjectId]
  );

  useEffect(() => {
    if (!selectedProject) {
      setActiveProjectId('');
      return;
    }

    if (!activeProjectId || String(selectedProject.id) !== String(activeProjectId)) {
      setActiveProjectId(String(selectedProject.id));
    }
  }, [activeProjectId, selectedProject]);

  const groupedTasks = useMemo(() => {
    const grouped = Object.fromEntries(WORKFLOW_COLUMNS.map((column) => [column.key, []]));

    tasks
      .filter((task) => selectedProject && task.project_id === selectedProject.id)
      .forEach((task) => {
        const status = WORKFLOW_STATUSES.has(task.workflow_status) ? task.workflow_status : 'backlog';
        grouped[status].push(task);
      });

    return grouped;
  }, [tasks, selectedProject]);

  const refetchBoard = () => {
    refetchTasks?.();
    refetchProjects?.();
  };

  const createProject = async (event) => {
    event.preventDefault();
    const trimmedName = newProjectName.trim();
    if (!trimmedName) return;

    setError('');
    try {
      const project = await projectsApi.create({ name: trimmedName });
      setNewProjectName('');
      setActiveProjectId(String(project.id));
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to create project');
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!selectedProject || !newTask.title.trim()) return;

    setError('');
    try {
      await tasksApi.create({
        title: newTask.title.trim(),
        task_type: 'one-time',
        due_date: newTask.due_date || null,
        project_id: selectedProject.id,
        workflow_status: 'backlog',
        assigned_user_ids: newTask.assigned_user_ids,
      });
      setNewTask({ ...EMPTY_TASK_FORM });
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to create task');
    }
  };

  const archiveProject = async (projectId) => {
    setError('');
    try {
      await projectsApi.archive(projectId);
      if (String(projectId) === String(activeProjectId)) {
        setActiveProjectId('');
      }
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to archive project');
    }
  };

  const restoreProject = async (projectId) => {
    setError('');
    try {
      await projectsApi.restore(projectId);
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to restore project');
    }
  };

  const deleteProject = async (projectId) => {
    setError('');
    try {
      await projectsApi.delete(projectId);
      if (String(projectId) === String(activeProjectId)) {
        setActiveProjectId('');
      }
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to delete project');
    }
  };

  const moveTask = async (taskId, nextStatus) => {
    if (!WORKFLOW_STATUSES.has(nextStatus)) return;

    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.workflow_status === nextStatus) return;

    setError('');
    try {
      await tasksApi.update(task.id, { workflow_status: nextStatus });
      refetchTasks?.();
    } catch (err) {
      setError(err.message || 'Failed to move task');
    }
  };

  const openTaskEditor = (task) => {
    setError('');
    setEditingTask(task);
  };

  const closeTaskEditor = () => {
    setEditingTask(null);
    setIsTaskActionLoading(false);
  };

  const saveTaskEdits = async (form) => {
    if (!editingTask) return;

    setError('');
    setIsTaskActionLoading(true);
    try {
      await tasksApi.update(editingTask.id, {
        due_date: form.due_date || null,
        assigned_user_ids: form.assigned_user_ids,
        project_id: form.project_id ? Number(form.project_id) : null,
      });
      closeTaskEditor();
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to update task');
      setIsTaskActionLoading(false);
    }
  };

  const deleteTask = async (taskId) => {
    setError('');
    setIsTaskActionLoading(true);
    try {
      await tasksApi.delete(taskId);
      closeTaskEditor();
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to delete task');
      setIsTaskActionLoading(false);
    }
  };

  const toggleAssignee = (userId) => {
    setNewTask((prev) => ({
      ...prev,
      assigned_user_ids: prev.assigned_user_ids.includes(userId)
        ? prev.assigned_user_ids.filter((id) => id !== userId)
        : [...prev.assigned_user_ids, userId],
    }));
  };

  const handleDrop = async (targetStatus) => {
    if (!draggedTaskId) return;
    await moveTask(draggedTaskId, targetStatus);
    setDraggedTaskId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-display font-bold text-2xl text-slate-800">Project Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={createProject} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-2">
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Create new project"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
          />
          <button type="submit" className="px-3 py-2 bg-sky-600 text-white rounded-lg">
            <Plus className="w-4 h-4" />
          </button>
        </form>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
          <label className="text-sm text-slate-600">Active project</label>
          <select
            value={activeProjectId || selectedProject?.id || ''}
            onChange={(e) => setActiveProjectId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
          >
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">View Projects</h2>
          {activeProjects.length === 0 ? (
            <p className="text-sm text-slate-500">No active projects.</p>
          ) : (
            <div className="space-y-2">
              {activeProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-medium text-slate-700">{project.name}</p>
                    <p className="text-xs text-slate-500">{project.task_count || 0} tasks</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => archiveProject(project.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    <Archive className="w-4 h-4" />
                    Archive
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">View Archived Projects</h2>
          {archivedProjects.length === 0 ? (
            <p className="text-sm text-slate-500">No archived projects.</p>
          ) : (
            <div className="space-y-2">
              {archivedProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-medium text-slate-700">{project.name}</p>
                    <p className="text-xs text-slate-500">Archived</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => restoreProject(project.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProject(project.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedProject && (
        <form onSubmit={createTask} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">Add task to {selectedProject.name}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={newTask.title}
              onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Task title"
              className="px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
            <input
              type="date"
              value={newTask.due_date}
              onChange={(e) => setNewTask((prev) => ({ ...prev, due_date: e.target.value }))}
              className="px-3 py-2 border border-slate-300 rounded-lg"
            />
            <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded-lg">Add task</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {users.map((user) => (
              <label
                key={user.id}
                className={`px-3 py-1 rounded-full border cursor-pointer ${
                  newTask.assigned_user_ids.includes(user.id)
                    ? 'bg-sky-50 border-sky-400 text-sky-700'
                    : 'border-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={newTask.assigned_user_ids.includes(user.id)}
                  onChange={() => toggleAssignee(user.id)}
                />
                {user.name}
              </label>
            ))}
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!selectedProject ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-slate-500">Create a project to get started.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          {WORKFLOW_COLUMNS.map((column) => (
            <KanbanColumn
              key={column.key}
              column={column}
              tasks={groupedTasks[column.key] || []}
              users={users}
              onMoveTask={moveTask}
              onDragStart={setDraggedTaskId}
              onDrop={handleDrop}
              onEditTask={openTaskEditor}
            />
          ))}
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          users={users}
          projects={activeProjects}
          onClose={closeTaskEditor}
          onSave={saveTaskEdits}
          onDelete={deleteTask}
          saving={isTaskActionLoading}
          error={error}
        />
      )}
    </div>
  );
}
