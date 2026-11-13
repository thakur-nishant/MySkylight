import { FESTIVALS, festivalsInYear, panchang } from './vendor/india-festival-dates/index.js';

/**
 * Built-in calendars users can overlay on the shared calendar. These are
 * calculated locally (no external API) and are off until a user enables them.
 */
export const SYSTEM_CALENDARS = [
  {
    id: 'hindu-festivals',
    name: 'Hindu Festivals',
    description: 'Festivals, jayantis and regional new years from the Hindu calendar. Dates are calculated for Delhi, India (IST).',
    color: '#d97706',
    attribution: 'Calculated with india-festival-dates (MIT) · Delhi, IST',
  },
  {
    id: 'hindu-panchang',
    name: 'Hindu Panchang',
    description: 'Daily tithi and nakshatra at sunrise. Dates and times are calculated for Delhi, India (IST).',
    color: '#7c3aed',
    attribution: 'Calculated with india-festival-dates (MIT) · Delhi, IST',
  },
];

const PLACE = 'new-delhi';
const MAX_SYSTEM_RANGE_DAYS = 370;
const MAX_PANCHANG_CACHE = 1500;

const HINDU_FESTIVALS = FESTIVALS.filter((festival) => festival.tradition === 'hindu');
const HINDU_FESTIVAL_IDS = new Set(HINDU_FESTIVALS.map((festival) => festival.id));
const FESTIVAL_RULES = new Map(HINDU_FESTIVALS.map((festival) => [festival.id, festival.rule]));

const festivalCache = new Map();
const panchangCache = new Map();

const IST_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

function formatIst(ms) {
  if (!Number.isFinite(ms)) return null;
  return `${IST_DATE_TIME.format(new Date(ms))} IST`;
}

function getHinduFestivals(year) {
  if (!festivalCache.has(year)) {
    const festivals = festivalsInYear(year, PLACE).filter((festival) =>
      HINDU_FESTIVAL_IDS.has(festival.id)
    );
    festivalCache.set(year, festivals);
  }
  return festivalCache.get(year);
}

function getPanchang(dateString) {
  if (!panchangCache.has(dateString)) {
    if (panchangCache.size >= MAX_PANCHANG_CACHE) {
      panchangCache.delete(panchangCache.keys().next().value);
    }
    panchangCache.set(dateString, panchang(dateString, PLACE));
  }
  return panchangCache.get(dateString);
}

function festivalDescription(festival) {
  const lines = [];
  if (festival.parts?.length) {
    lines.push(festival.parts.map((part) => `${part.name}: ${part.date}`).join('\n'));
  }
  if (festival.vaishnava) {
    lines.push(`Vaishnava observance: ${festival.vaishnava}`);
  }
  if (festival.first !== festival.last) {
    lines.push(`Observed ${festival.first} to ${festival.last}`);
  }
  lines.push('Hindu calendar · Delhi, India (IST)');
  return lines.join('\n');
}

function festivalEvents(source, start, end) {
  const firstYear = Number(start.slice(0, 4)) - 1;
  const lastYear = Number(end.slice(0, 4));
  const events = [];

  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const festival of getHinduFestivals(year)) {
      if (festival.last < start || festival.first > end) continue;
      events.push({
        id: `system-${source.id}-${festival.id}-${festival.first}`,
        title: festival.name,
        // react-big-calendar treats all-day `end` as exclusive.
        start: festival.first,
        end: addDays(festival.last, 1),
        allDay: true,
        resource: {
          type: 'system',
          calendarId: source.id,
          calendarName: source.name,
          calendarColor: source.color,
          attribution: source.attribution,
          festivalId: festival.id,
          firstDate: festival.first,
          lastDate: festival.last,
          parts: festival.parts ?? [],
          rule: FESTIVAL_RULES.get(festival.id) ?? null,
          description: festivalDescription(festival),
        },
      });
    }
  }

  return events;
}

function panchangEvents(source, start, end) {
  const events = [];
  const totalDays = daysBetween(start, end);

  for (let offset = 0; offset <= totalDays; offset += 1) {
    const date = addDays(start, offset);
    const day = getPanchang(date);
    const month = day.month.adhik ? `${day.month.amanta} (Adhika)` : day.month.amanta;
    const description = [
      `Tithi: ${day.tithi.name} (ends ${formatIst(day.tithi.ends)})`,
      `Nakshatra: ${day.nakshatra.name} (ends ${formatIst(day.nakshatra.ends)})`,
      `Month: ${month}`,
      `Sun sign: ${day.sunSign}`,
      `Sunrise: ${formatIst(day.sunrise)}`,
      `Sunset: ${formatIst(day.sunset)}`,
      'Panchang · Delhi, India (IST)',
    ].join('\n');

    events.push({
      id: `system-${source.id}-${date}`,
      title: `${day.tithi.name} · ${day.nakshatra.name}`,
      start: date,
      end: addDays(date, 1),
      allDay: true,
      resource: {
        type: 'system',
        calendarId: source.id,
        calendarName: source.name,
        calendarColor: source.color,
        attribution: source.attribution,
        firstDate: date,
        lastDate: date,
        tithi: day.tithi.name,
        nakshatra: day.nakshatra.name,
        month,
        sunSign: day.sunSign,
        description,
      },
    });
  }

  return events;
}

/**
 * Build calendar events for the enabled system calendars in a date range.
 * Both range values are inclusive `YYYY-MM-DD` strings.
 */
export function getSystemCalendarEvents(enabledIds, start, end) {
  if (!Array.isArray(enabledIds) || enabledIds.length === 0) return [];
  if (!isValidDateString(start) || !isValidDateString(end) || end < start) return [];
  if (daysBetween(start, end) > MAX_SYSTEM_RANGE_DAYS) return [];

  const enabled = new Set(enabledIds);
  const events = [];

  for (const source of SYSTEM_CALENDARS) {
    if (!enabled.has(source.id)) continue;
    try {
      if (source.id === 'hindu-festivals') {
        events.push(...festivalEvents(source, start, end));
      } else if (source.id === 'hindu-panchang') {
        events.push(...panchangEvents(source, start, end));
      }
    } catch (error) {
      console.error(`Failed to calculate ${source.id} events`, error);
    }
  }

  return events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
}

export function getEnabledCalendarIds(userId, db) {
  const rows = db
    .prepare('SELECT calendar_id FROM calendar_subscriptions WHERE user_id = ?')
    .all(userId);
  return rows.map((row) => row.calendar_id);
}
