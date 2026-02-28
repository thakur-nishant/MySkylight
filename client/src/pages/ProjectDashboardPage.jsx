import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { projects as projectsApi, tasks as tasksApi, users as usersApi } from '../api';
import { useQuery } from '../hooks/useQuery';
import { WORKFLOW_COLUMNS, WORKFLOW_STATUSES } from '../constants/workflow';
import KanbanColumn from '../components/projects/KanbanColumn';

const EMPTY_TASK_FORM = { title: '', due_date: '', assigned_user_ids: [] };

export default function ProjectDashboardPage() {
  const [activeProjectId, setActiveProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newTask, setNewTask] = useState(EMPTY_TASK_FORM);
  const [error, setError] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  const { data: projects = [], refetch: refetchProjects, isLoading: projectsLoading } = useQuery(
    ['projects'],
    () => projectsApi.list()
  );
  const { data: users = [], isLoading: usersLoading } = useQuery(['users'], () => usersApi.list());
  const { data: tasks = [], refetch: refetchTasks, isLoading: tasksLoading } = useQuery(
    ['tasks', activeProjectId],
    () => tasksApi.list(activeProjectId ? { project_id: activeProjectId } : undefined)
  );

  const isLoading = projectsLoading || usersLoading || tasksLoading;

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(activeProjectId)) || projects[0],
    [projects, activeProjectId]
  );

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
      setNewTask(EMPTY_TASK_FORM);
      refetchBoard();
    } catch (err) {
      setError(err.message || 'Failed to create task');
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
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
