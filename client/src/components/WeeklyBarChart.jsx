import React from 'react';

export default function WeeklyBarChart({ days = [] }) {
  return (
    <div className="grid grid-cols-7 gap-2 items-end h-40">
      {days.map((day) => (
        <div key={day.date} className="flex flex-col items-center gap-2">
          <div className="w-full max-w-10 h-28 bg-slate-100 rounded-md overflow-hidden flex items-end">
            <div
              className="w-full bg-sky-500 transition-all"
              style={{ height: `${Math.max(0, Math.min(100, day.percent || 0))}%` }}
            />
          </div>
          <p className="text-xs text-slate-600">{day.label}</p>
          <p className="text-xs font-medium text-slate-700">{Math.round(day.percent || 0)}%</p>
        </div>
      ))}
    </div>
  );
}
