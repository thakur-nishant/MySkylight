import React, { useState } from 'react';
import { integrations } from '../api';
import { formatDatePST, todayPST } from '../utils/dateUtils';

export default function GoogleCalendarIntegration({ connected = false, onImported }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleConnect = async () => {
    setMessage('');
    try {
      const res = await integrations.google.connectUrl();
      if (res && res.url) {
        window.open(res.url, '_blank', 'noopener');
        setMessage('Opened the Google consent window. After connecting, close that window and use Import below.');
      } else {
        setMessage('Failed to get connect URL');
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to get connect URL');
    }
  };

  const handleImport = async () => {
    setMessage('');
    setLoading(true);
    try {
      const start = formatDatePST(todayPST());
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      const end = formatDatePST(endDate);

      const res = await integrations.google.importRange(start, end);
      if (res && Array.isArray(res.imported)) {
        setMessage(`Imported ${res.imported.length} event${res.imported.length === 1 ? '' : 's'}.`);
      } else if (res && res.imported) {
        setMessage('Imported 1 event.');
      } else {
        setMessage('Import completed.');
      }
      if (onImported) onImported(res);
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`}
        />
        {connected ? 'Google Calendar connected' : 'Not connected yet'}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={loading}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? 'Importing…' : 'Import next 30 days'}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Imported events are copied into MySkylight as editable events.
      </p>
      {message && <div className="text-xs text-slate-500">{message}</div>}
    </div>
  );
}
