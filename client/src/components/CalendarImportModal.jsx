import React from 'react';
import { CalendarPlus, Globe2, X } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';
import GoogleCalendarIntegration from './GoogleCalendarIntegration';

export default function CalendarImportModal({
  sources = [],
  google = { enabled: false, connected: false },
  error = '',
  pendingId = null,
  onToggle,
  onClose,
  onImported,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Import calendars</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add system calendars or connect Google Calendar. Each calendar has its own toggle and
              can be turned off at any time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import calendars"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-8 p-6">
          <section>
            <div className="mb-3 flex items-start gap-3">
              <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                <CalendarPlus className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">System calendars</h3>
                <p className="text-sm text-slate-500">
                  Calculated locally for Delhi, India (IST). New calendars start off by default.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                    source.enabled
                      ? 'border-sky-200 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: source.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800">{source.name}</p>
                      {source.enabled && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          Added
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{source.description}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{source.attribution}</p>
                  </div>
                  <div className="pt-0.5">
                    <ToggleSwitch
                      checked={!!source.enabled}
                      onChange={(enabled) => onToggle(source.id, enabled)}
                      disabled={pendingId === source.id}
                      label={`${source.enabled ? 'Remove' : 'Add'} ${source.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </section>

          <section>
            <div className="mb-3 flex items-start gap-3">
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <Globe2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Google Calendar</h3>
                <p className="text-sm text-slate-500">
                  Connect your account and copy events into MySkylight.
                </p>
              </div>
            </div>

            {google.enabled ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <GoogleCalendarIntegration connected={google.connected} onImported={onImported} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Google Calendar is not configured on this server.
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          System calendar choices are saved to your account. Google imports add events to this
          household.
        </div>
      </div>
    </div>
  );
}
