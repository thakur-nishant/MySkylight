// Festivals outside the Hindu panchang: the Christian movable feasts
// (Gregorian computus), civic days, the Parsi calendar, and the Chinese
// lunisolar new year.
import { nextNewMoon, previousNewMoon, searchSunTropical } from '../astro.js';
import { single } from '../festival.js';
import { addDays, daysBetween, formatDate, localDate, nthWeekday } from '../time.js';
const DAY_MS = 86_400_000;
/**
 * Western (Gregorian) Easter Sunday by the anonymous Gregorian computus
 * (Meeus/Jones/Butcher): the Sunday after the ecclesiastical full moon on
 * or after 21 March.
 */
export function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return formatDate(year, month, day);
}
const fixed = (id, name, month, day, rule, tradition = 'civic') => ({
    id,
    name,
    tradition,
    rule,
    days: (year) => [single(formatDate(year, month, day))],
});
const fromEaster = (id, name, offset, rule) => ({
    id,
    name,
    tradition: 'christian',
    rule,
    days: (year) => [single(addDays(easterSunday(year), offset))],
});
const country = (loc) => (loc.country ?? '').toUpperCase();
// --- Parsi calendar ---------------------------------------------------------
/**
 * Julian Day Number of a proleptic Julian calendar date.
 */
function jdnJulian(y, m, d) {
    const a = Math.floor((14 - m) / 12);
    const yy = y + 4800 - a;
    const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
}
function jdnOf(date) {
    // 1970-01-01 is JDN 2440588.
    return 2440588 + daysBetween('1970-01-01', date);
}
/**
 * The Yazdegerdi era starts on 16 June 632 (Julian), the accession of
 * Yazdegerd III; the Zoroastrian year has 365 days and no leap day. The
 * Qadimi reckoning keeps that count; the Shahenshahi reckoning, followed
 * by most Parsis in India, is one month (30 days) behind it.
 */
const YAZDEGERDI_EPOCH = jdnJulian(632, 6, 16);
const SHAHENSHAHI_LAG = 30;
/** Shahenshahi Navroz (1 Farvardin) falling in a Gregorian year. */
export function shahenshahiNavroz(year) {
    const jan1 = jdnOf(formatDate(year, 1, 1));
    const since = jan1 - YAZDEGERDI_EPOCH - SHAHENSHAHI_LAG;
    const offset = (((365 - (since % 365)) % 365) + 365) % 365;
    return addDays(formatDate(year, 1, 1), offset);
}
/**
 * The March equinox day by the Iranian rule: the day of the equinox at
 * Tehran's standard time (UTC+3:30, the 52.5°E meridian) if it comes
 * before noon there, else the next day.
 */
export function iranianNowruz(year) {
    const at = searchSunTropical(0, Date.UTC(year, 2, 10), 30);
    const local = new Date(at + 3.5 * 3600_000);
    const day = formatDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
    return local.getUTCHours() >= 12 ? addDays(day, 1) : day;
}
// --- Chinese new year -------------------------------------------------------
const BEIJING = 'Asia/Shanghai';
function beijingDay(ms) {
    return localDate(ms, BEIJING);
}
/** The month-11 start: the last new moon on or before the winter-solstice day (Beijing dates). */
function month11Start(year) {
    const solstice = searchSunTropical(270, Date.UTC(year, 11, 1), 40);
    let nm = previousNewMoon(solstice + DAY_MS);
    if (beijingDay(nm) > beijingDay(solstice))
        nm = previousNewMoon(nm - DAY_MS);
    return nm;
}
/**
 * Chinese New Year in `year`: the start of month 1. Count the new moons
 * from month 11 of the previous year to month 11 of this one (dates in
 * Beijing time, UTC+8). Twelve months: New Year is the second new moon
 * after the first month 11. Thirteen: the first month without a major
 * solar term (zhongqi, a multiple of 30° of solar longitude) is the leap
 * month; if that is the 11th or 12th month, New Year moves a month later.
 */
export function chineseNewYear(year) {
    const a = month11Start(year - 1);
    const b = month11Start(year);
    const moons = [a];
    while (moons[moons.length - 1] < b - DAY_MS)
        moons.push(nextNewMoon(moons[moons.length - 1] + DAY_MS));
    const count = moons.length - 1;
    let newYear = 2;
    if (count === 13) {
        const solstice = searchSunTropical(270, Date.UTC(year - 1, 11, 1), 40);
        const terms = [];
        for (let j = 0, from = solstice - DAY_MS; j < 14; j++) {
            const t = searchSunTropical((270 + 30 * j) % 360, from, 40);
            terms.push(beijingDay(t));
            from = t + DAY_MS;
        }
        for (let i = 0; i < count; i++) {
            const s = beijingDay(moons[i]);
            const e = beijingDay(moons[i + 1]);
            if (!terms.some((t) => t >= s && t < e)) {
                if (i === 1 || i === 2)
                    newYear = 3;
                break;
            }
        }
    }
    return beijingDay(moons[newYear]);
}
// --- The festivals ----------------------------------------------------------
export const OTHER_FESTIVALS = [
    fromEaster('palm-sunday', 'Palm Sunday', -7, 'The Sunday before Easter (Western computus).'),
    fromEaster('good-friday', 'Good Friday', -2, 'The Friday before Easter (Western computus).'),
    fromEaster('easter', 'Easter', 0, 'Western Easter Sunday by the Gregorian computus: the Sunday after the ecclesiastical full ' +
        'moon on or after 21 March.'),
    fixed('christmas', 'Christmas', 12, 25, '25 December.', 'christian'),
    fixed('new-year', 'New Year', 1, 1, '1 January.'),
    fixed('republic-day', 'Republic Day', 1, 26, 'India: 26 January.'),
    fixed('womens-day', "International Women's Day", 3, 8, '8 March.'),
    fixed('independence-day', 'Independence Day', 8, 15, 'India: 15 August.'),
    fixed('teachers-day', "Teachers' Day", 9, 5, 'India: 5 September.'),
    fixed('gandhi-jayanti', 'Gandhi Jayanti', 10, 2, 'India: 2 October.'),
    fixed('childrens-day', "Children's Day", 11, 14, 'India: 14 November.'),
    {
        id: 'friendship-day',
        name: 'Friendship Day',
        tradition: 'civic',
        rule: 'The first Sunday of August (as kept in India).',
        days: (year) => [single(nthWeekday(year, 8, 0, 1))],
    },
    {
        id: 'mothers-day',
        name: "Mother's Day",
        tradition: 'civic',
        rule: 'The second Sunday of May; in the UK and Ireland, Mothering Sunday, three weeks before ' +
            'Easter; in the UAE and much of the Arab world, 21 March.',
        days: (year, loc) => {
            const c = country(loc);
            if (c === 'GB' || c === 'IE')
                return [single(addDays(easterSunday(year), -21))];
            if (c === 'AE')
                return [single(formatDate(year, 3, 21))];
            return [single(nthWeekday(year, 5, 0, 2))];
        },
    },
    {
        id: 'fathers-day',
        name: "Father's Day",
        tradition: 'civic',
        rule: 'The third Sunday of June; in Australia and New Zealand, the first Sunday of September.',
        days: (year, loc) => {
            const c = country(loc);
            if (c === 'AU' || c === 'NZ')
                return [single(nthWeekday(year, 9, 0, 1))];
            return [single(nthWeekday(year, 6, 0, 3))];
        },
    },
    {
        id: 'thanksgiving',
        name: 'Thanksgiving',
        tradition: 'civic',
        rule: 'Canada: the second Monday of October. United States: the fourth Thursday of November. Elsewhere none.',
        days: (year, loc) => {
            const c = country(loc);
            if (c === 'CA')
                return [single(nthWeekday(year, 10, 1, 2))];
            if (c === 'US')
                return [single(nthWeekday(year, 11, 4, 4))];
            return [];
        },
    },
    {
        id: 'grandparents-day',
        name: "Grandparents' Day",
        tradition: 'civic',
        rule: 'Canada and the United States: the Sunday after Labour Day (the first Monday of September). Elsewhere none.',
        days: (year, loc) => {
            const c = country(loc);
            if (c !== 'CA' && c !== 'US')
                return [];
            return [single(addDays(nthWeekday(year, 9, 1, 1), 6))];
        },
    },
    {
        id: 'parsi-new-year',
        name: 'Parsi New Year (Navroz)',
        tradition: 'parsi',
        rule: 'Shahenshahi Navroz, 1 Farvardin: a 365-day year counted from the Yazdegerdi era (16 June ' +
            '632, Julian), one month behind the Qadimi reckoning. It moves a day earlier every four years.',
        days: (year) => [single(shahenshahiNavroz(year))],
    },
    {
        id: 'khordad-sal',
        name: 'Khordad Sal',
        tradition: 'parsi',
        rule: 'Zarathustra\'s birthday, 6 Farvardin (Shahenshahi): five days after Navroz.',
        days: (year) => [single(addDays(shahenshahiNavroz(year), 5))],
    },
    {
        id: 'jamshedi-navroz',
        name: 'Jamshedi Navroz',
        tradition: 'parsi',
        rule: 'The March equinox (the Fasli/Iranian new year): the day of the equinox in Tehran if it comes ' +
            'before noon there, else the next day.',
        days: (year) => [single(iranianNowruz(year))],
    },
    {
        id: 'lunar-new-year',
        name: 'Lunar New Year',
        tradition: 'chinese',
        rule: 'Chinese New Year and the day after: the new moon that starts month 1 of the Chinese ' +
            'calendar, by Beijing time (UTC+8), usually the second new moon after the winter solstice.',
        days: (year) => {
            const d = chineseNewYear(year);
            return [{ first: d, last: addDays(d, 1) }];
        },
    },
];
