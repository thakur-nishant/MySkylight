export const WORKFLOW_COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

export const WORKFLOW_STATUSES = new Set(WORKFLOW_COLUMNS.map((column) => column.key));
