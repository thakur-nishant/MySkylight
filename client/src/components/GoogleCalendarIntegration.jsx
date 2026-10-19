import React, { useState } from 'react';
import { integrations } from '../api';
import { formatDatePST, todayPST } from '../utils/dateUtils';

export default function GoogleCalendarIntegration() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleConnect = async () => {
    setMessage('');
    try {
      const res = await integrations.google.connectUrl();
      if (res && res.url) {
        // open in new window for OAuth flow
        window.open(res.url, '_blank', 'noopener');
        setMessage('Opened Google consent window. After connecting, run Import.');
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
      // default import next 30 days
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      const end = formatDatePST(endDate);

      const res = await integrations.google.importRange(start, end);
      if (res && Array.isArray(res.imported)) {
        setMessage(`Imported ${res.imported.length} events.`);
      } else if (res && res.imported) {
        setMessage(`Imported 1 event.`);
      } else {
        setMessage('Import completed.');
      }
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button onClick={handleConnect} className="w-full px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm">
        Connect Google Calendar
      </button>
      <button onClick={handleImport} disabled={loading} className="w-full px-3 py-2 rounded-lg bg-sky-600 text-white text-sm">
        {loading ? 'Importing…' : 'Import Google Events'}
      </button>
      {message && <div className="text-xs text-slate-500">{message}</div>}
    </div>
  );
}
