// src/utils/dateUtils.js
import * as tz from 'date-fns-tz';
import { format } from 'date-fns';

export const TIMEZONE = 'America/Los_Angeles';

/* ----------------------------------------
 * Convert a UTC date string → PST Date object
 * ---------------------------------------- */
export function toZonedTime(date) {
  if (!date) return null;
  return tz.toZonedTime(date, TIMEZONE); // utc → PST
}

/* ----------------------------------------
 * Convert a PST date string (yyyy-MM-dd) → UTC ISO string
 * ---------------------------------------- */
export function zonedTimeToUtc(dateStr) {
  if (!dateStr) return null;
  const utcDate = fromZonedTime(`${dateStr}T00:00:00`, TIMEZONE);
  return format(utcDate, 'yyyy-MM-dd');
}

/* ----------------------------------------
 * Format a date (Date object) as yyyy-MM-dd in PST
 * ---------------------------------------- */
export function formatDatePST(date) {
  if (!date) return '';
  const pstDate = tz.toZonedTime(date, TIMEZONE);
  return format(pstDate, 'yyyy-MM-dd');
}

/* ----------------------------------------
 * Helper: today in PST
 * ---------------------------------------- */
export function todayPST() {
  return tz.toZonedTime(new Date(), TIMEZONE);
}

/* ----------------------------------------
 * Convert a UTC date string → PST Date object
 * ---------------------------------------- */
export function toPST(date) {
  if (!date) return null;
  return tz.toZonedTime(date, TIMEZONE);
}

/* ----------------------------------------
 * Get week range (Monday → Sunday) in PST
 * ---------------------------------------- */
export function getWeekRangePST() {
  const now = todayPST();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: formatDatePST(monday),
    end: formatDatePST(sunday),
  };
}

/* ----------------------------------------
 * Get month range (1st → last day) in PST
 * ---------------------------------------- */
export function getMonthRangePST() {
  const now = todayPST();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: formatDatePST(start),
    end: formatDatePST(end),
  };
}

/* ----------------------------------------
 * Get year range (Jan 1 → today) in PST
 * ---------------------------------------- */
export function getYearRangePST() {
  const now = todayPST();
  return {
    start: formatDatePST(new Date(now.getFullYear(), 0, 1)),
    end: formatDatePST(now),
  };
}
