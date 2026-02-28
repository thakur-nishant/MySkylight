import React from 'react';
import { ArrowRight } from 'lucide-react';
import { WORKFLOW_COLUMNS } from '../../constants/workflow';

export default function KanbanColumn({
  column,
  tasks,
  users,
  onMoveTask,
  onDragStart,
  onDrop,
}) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl min-h-[320px]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(column.key)}
    >
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 font-medium text-slate-700">
        {column.label}
      </div>
      <div className="p-3 space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={() => onDragStart(task.id)}
            className="border border-slate-200 rounded-lg p-3 space-y-2 cursor-grab active:cursor-grabbing"
          >
            <p className="font-medium text-slate-800">{task.title}</p>
            {task.due_date && <p className="text-xs text-slate-500">Due: {task.due_date}</p>}
            {!!task.assigned_user_ids?.length && (
              <p className="text-xs text-slate-500">
                Assigned: {task.assigned_user_ids.map((uid) => users.find((u) => u.id === uid)?.name).filter(Boolean).join(', ')}
              </p>
            )}
            <div className="flex items-center gap-2">
              <select
                value={task.workflow_status || 'backlog'}
                onChange={(e) => onMoveTask(task.id, e.target.value)}
                className="text-xs px-2 py-1 border border-slate-300 rounded"
              >
                {WORKFLOW_COLUMNS.map((statusOption) => (
                  <option key={statusOption.key} value={statusOption.key}>{statusOption.label}</option>
                ))}
              </select>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </div>
          </div>
        ))}

        {tasks.length === 0 && <p className="text-sm text-slate-400">No tasks</p>}
      </div>
    </div>
  );
}
