import React from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';

export default function CalendarSourcesPanel({
  sources = [],
  loading = false,
  error = '',
  pendingId = null,
  onToggle,
  onImport,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-500" />
            Calendars
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Overlays for your account</p>
        </div>
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Import
        </button>
      </div>

      <div className="p-2">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">Household tasks</p>
            <p className="text-xs text-slate-500">Always on</p>
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">On</span>
        </div>

        {loading && (
          <div className="px-3 py-3 text-sm text-slate-500">Loading calendars…</div>
        )}

        {!loading &&
          sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: source.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{source.name}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{source.description}</p>
              </div>
              <ToggleSwitch
                checked={!!source.enabled}
                onChange={(enabled) => onToggle(source.id, enabled)}
                disabled={pendingId === source.id}
                label={`${source.enabled ? 'Hide' : 'Show'} ${source.name}`}
              />
            </div>
          ))}
      </div>

      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
      <p className="px-4 pb-3 text-[11px] text-slate-400">
        Each system calendar can be turned on or off for your account.
      </p>
    </div>
  );
}
