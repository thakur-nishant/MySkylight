// Festivals of the Hindu lunar calendar (and the Sikh and Jain days that
// follow it). Months are amanta (new moon to new moon); the purnimanta
// name of a Krishna paksha day is the next month's, and each rule says
// both where they differ. Tithis: 1–15 Shukla, 16–30 Krishna (30 =
// Amavasya).
import { moonsetAfter, sunrise, sunset } from '../astro.js';
import { single } from '../festival.js';
import { kalaWindow, lunarMonthsAround, nakshatraAt, tithiInMonth, } from '../panchang.js';
import { bhadraIn, kalaDay, kalaHits, minus, udayaDay, vaishnavaDay, } from '../rules.js';
import { addDays } from '../time.js';
export const CHAITRA = 0;
export const VAISHAKHA = 1;
export const JYESHTHA = 2;
export const ASHADHA = 3;
export const SHRAVANA = 4;
export const BHADRAPADA = 5;
export const ASHWIN = 6;
export const KARTIKA = 7;
export const MARGASHIRSHA = 8;
export const PAUSHA = 9;
export const MAGHA = 10;
export const PHALGUNA = 11;
/** Krishna paksha tithi n (1–15) as a 16–30 number. */
const K = (n) => 15 + n;
/** Run `f` on every nija month named `month` near `year`; keep observances that start in `year`. */
function perMonth(month, f, adhik = 'skip') {
    return (year, loc) => {
        const out = [];
        const months = lunarMonthsAround(year);
        for (let i = 0; i < months.length; i++) {
            const m = months[i];
            if (m.month !== month)
                continue;
            if (adhik === 'skip' && m.adhik)
                continue;
            // keep-first: in a year with an adhik month the festival is kept in it.
            if (adhik === 'keep-first' && !m.adhik && months[i - 1]?.adhik && months[i - 1]?.month === month)
                continue;
            const days = f(m, loc);
            if (days && days.first.startsWith(`${year}-`) && !out.some((o) => o.first === days.first))
                out.push(days);
        }
        return out;
    };
}
/** The day of tithi `t` in month `m` by the kala rule (or udaya with 'sunrise'). */
export function tithiDay(m, t, kala, loc, both = 'first', none = 'udaya') {
    const iv = tithiInMonth(m, t);
    return kala === 'sunrise'
        ? udayaDay(iv, loc, both === 'second' ? 'second' : 'first')
        : kalaDay(iv, kala, loc, both, none);
}
function simple(spec) {
    return {
        id: spec.id,
        name: spec.name,
        tradition: spec.tradition ?? 'hindu',
        rule: spec.rule,
        days: perMonth(spec.month, (m, loc) => single(tithiDay(m, spec.tithi, spec.kala, loc, spec.both, spec.none)), spec.adhik),
    };
}
// --- Special rules ----------------------------------------------------------
/** Length of a muhurta on a day: a fifteenth of daytime. */
function muhurta(date, loc) {
    return (sunset(date, loc) - sunrise(date, loc)) / 15;
}
/**
 * Purnima observances that must avoid bhadra (Holika Dahan in pradosh,
 * Raksha Bandhan in aparahna): the first day on which Purnima, free of
 * bhadra, touches the kala. If bhadra spoils the kala on that day:
 * - with `nightAfterBhadra` (Holika Dahan): the next evening when Purnima
 *   lasts three and a half prahars after its sunrise and Pratipada is
 *   increasing; else the same evening, after bhadra ends or in bhadra
 *   punchha. A Purnima that touches no pradosh is burnt the night it begins;
 * - else the next day, when Purnima still lasts at least three muhurtas
 *   after its sunrise;
 * - else the day with Purnima in the kala (after bhadra ends).
 */
function purnimaWithoutBhadra(m, kala, loc, nightAfterBhadra = false) {
    const iv = tithiInMonth(m, 15);
    const bhadra = bhadraIn(15, iv);
    const hits = kalaHits(iv, kala, loc);
    for (const h of hits) {
        const w = kalaWindow(kala, h.date, loc);
        const inTithi = { start: Math.max(w.start, iv.start), end: Math.min(w.end, iv.end) };
        if (minus(inTithi, bhadra).length > 0)
            return h.date;
    }
    if (nightAfterBhadra) {
        // A Purnima that touches no pradosh is burnt the night it begins.
        const first = hits[0]?.date;
        if (!first)
            return kalaDay(iv, kala, loc, 'first', 'before-start');
        // Sardha-triyama: when Purnima lasts three and a half prahars (7/8 of
        // daytime) after the next sunrise and the Pratipada that follows is
        // longer than Purnima (vriddhi), the next evening, in Pratipada.
        const next = addDays(first, 1);
        const rise = sunrise(next, loc);
        const pratipada = tithiInMonth(m, 16);
        const vriddhi = pratipada.end - pratipada.start > iv.end - iv.start;
        if (vriddhi && iv.end - rise >= (7 / 8) * (sunset(next, loc) - rise))
            return next;
        // Otherwise the same evening, after bhadra ends or in its tail (punchha).
        return first;
    }
    const first = hits[0]?.date ?? udayaDay(iv, loc);
    const next = addDays(first, 1);
    const rise = sunrise(next, loc);
    if (iv.end - rise >= 3 * muhurta(next, loc))
        return next;
    return first;
}
/**
 * Chandra darshan: the first evening after the new moon on which the
 * crescent can be seen. Taken here as the first evening on which the
 * Moon sets at least an hour after the Sun.
 */
function chandraDarshan(m, loc) {
    let d = udayaDay({ start: m.start, end: m.start + 1 }, loc);
    for (let i = 0; i < 4; i++) {
        const set = sunset(d, loc);
        if (set > m.start) {
            const moonset = moonsetAfter(set, loc);
            if (moonset !== null && moonset - set >= 60 * 60_000)
                return d;
        }
        d = addDays(d, 1);
    }
    return d;
}
/** Ghatasthapana: Pratipada at sunrise lasting a muhurta after it. */
function ghatasthapana(m, loc) {
    return udayaDay(tithiInMonth(m, 1), loc, 'first', 1);
}
const ROHINI = 3;
const SHRAVANA_NAKSHATRA = 21;
/** Is the nakshatra current at any moment of the window? (Checked at its ends and middle.) */
function nakshatraIn(index, w) {
    return [w.start, (w.start + w.end) / 2, w.end].some((t) => nakshatraAt(t) === index);
}
/** Smarta Janmashtami: Ashtami and Rohini at nishita, as the rule in HINDU_FESTIVALS states. */
function smartaJanmashtami(iv, loc) {
    const hits = kalaHits(iv, 'nishita', loc);
    for (const h of hits) {
        if (nakshatraIn(ROHINI, kalaWindow('nishita', h.date, loc)))
            return h.date;
    }
    const first = hits[0]?.date;
    if (!first)
        return udayaDay(iv, loc);
    // The next day keeps Ashtami at sunrise and has Rohini join it before
    // Ashtami ends, with Rohini still there at nishita.
    const next = addDays(first, 1);
    const rise = sunrise(next, loc);
    if (hits.length === 1 &&
        rise < iv.end &&
        nakshatraIn(ROHINI, { start: rise, end: iv.end }) &&
        nakshatraIn(ROHINI, kalaWindow('nishita', next, loc)))
        return next;
    return hits[hits.length - 1]?.date ?? first;
}
/**
 * Dussehra: Dashami in aparahna. On two days, the one on which Shravana
 * nakshatra joins Dashami in aparahna, else the first; on neither, the
 * udaya day.
 */
function dussehraDay(m, loc) {
    const iv = tithiInMonth(m, 10);
    const hits = kalaHits(iv, 'aparahna', loc);
    if (hits.length >= 2) {
        for (const h of hits) {
            const w = kalaWindow('aparahna', h.date, loc);
            const both = { start: Math.max(w.start, iv.start), end: Math.min(w.end, iv.end) };
            if (starDuring(SHRAVANA_NAKSHATRA, both))
                return h.date;
        }
    }
    return hits[0]?.date ?? udayaDay(iv, loc);
}
/** Is the Moon in the nakshatra at any minute of the window? */
function starDuring(index, w) {
    for (let t = w.start; t <= w.end; t += 10 * 60_000)
        if (nakshatraAt(t) === index)
            return true;
    return nakshatraAt(w.end) === index;
}
const rangeOf = (first, last, parts) => parts ? { first, last, parts } : { first, last };
// --- The festivals ----------------------------------------------------------
export const HINDU_FESTIVALS = [
    simple({
        id: 'vasant-panchami',
        name: 'Vasant Panchami',
        month: MAGHA,
        tithi: 5,
        kala: 'purvahna',
        rule: 'Magha Shukla Panchami, on the day Panchami prevails in the forenoon (purvahna).',
    }),
    simple({
        id: 'ratha-saptami',
        name: 'Ratha Saptami',
        month: MAGHA,
        tithi: 7,
        kala: 'sunrise',
        rule: 'Magha Shukla Saptami, on the day Saptami is current at sunrise (the bath is at dawn).',
    }),
    simple({
        id: 'maha-shivratri',
        name: 'Maha Shivratri',
        month: MAGHA,
        tithi: K(14),
        kala: 'nishita',
        rule: 'Krishna Chaturdashi of Magha (amanta; Phalguna in the purnimanta reckoning), on the night ' +
            'Chaturdashi prevails at nishita, the midnight muhurta.',
    }),
    {
        id: 'holika-dahan',
        name: 'Holika Dahan',
        tradition: 'hindu',
        rule: 'Phalguna Purnima, on the evening Purnima prevails in pradosh (the first fifth of the night) ' +
            'free of bhadra. If bhadra covers it: the next evening when Purnima lasts three and a half ' +
            'prahars (7/8 of daytime) after that sunrise and the Pratipada after it is longer than ' +
            'Purnima; else the same evening, after bhadra ends or in bhadra punchha. A Purnima that ' +
            'touches no pradosh is burnt the night it begins.',
        days: perMonth(PHALGUNA, (m, loc) => single(purnimaWithoutBhadra(m, 'pradosh', loc, true))),
    },
    {
        id: 'holi',
        name: 'Holi',
        tradition: 'hindu',
        rule: 'Rangwali Holi, the day after Holika Dahan.',
        days: perMonth(PHALGUNA, (m, loc) => single(addDays(purnimaWithoutBhadra(m, 'pradosh', loc, true), 1))),
    },
    {
        id: 'hola-mohalla',
        name: 'Hola Mohalla',
        tradition: 'sikh',
        rule: 'Three days from Chaitra Krishna Pratipada (amanta Phalguna Krishna Pratipada), the day ' +
            'Pratipada is current at sunrise.',
        days: perMonth(PHALGUNA, (m, loc) => {
            const d = tithiDay(m, K(1), 'sunrise', loc);
            return rangeOf(d, addDays(d, 2));
        }),
    },
    simple({
        id: 'gudi-padwa',
        name: 'Gudi Padwa / Ugadi',
        month: CHAITRA,
        tithi: 1,
        kala: 'sunrise',
        rule: 'Chaitra Shukla Pratipada, the day Pratipada is current at sunrise: the lunar new year.',
    }),
    {
        id: 'cheti-chand',
        name: 'Cheti Chand',
        tradition: 'hindu',
        rule: 'The Sindhi new year: the day after Chaitra Amavasya on which the new crescent is first ' +
            'seen (chandra darshan), taken as the first evening the Moon sets an hour or more after the Sun.',
        days: perMonth(CHAITRA, (m, loc) => single(chandraDarshan(m, loc))),
    },
    {
        id: 'chaitra-navratri',
        name: 'Chaitra Navratri',
        tradition: 'hindu',
        rule: 'From Ghatasthapana to Rama Navami (Smarta). Ghatasthapana: Chaitra Shukla Pratipada, the ' +
            'day it is current at sunrise and lasts at least a muhurta after it; else the day it begins.',
        days: perMonth(CHAITRA, (m, loc) => rangeOf(ghatasthapana(m, loc), tithiDay(m, 9, 'madhyahna', loc, 'second'))),
    },
    simple({
        id: 'gangaur',
        name: 'Gangaur',
        month: CHAITRA,
        tithi: 3,
        kala: 'sunrise',
        rule: 'Chaitra Shukla Tritiya (Gauri Tritiya), the day Tritiya is current at sunrise.',
    }),
    {
        id: 'ram-navami',
        name: 'Rama Navami',
        tradition: 'hindu',
        rule: 'Chaitra Shukla Navami. Smarta: the day Navami prevails at madhyahna (Rama was born at ' +
            'midday); the second day if it does on both. Vaishnava: the first day Navami is current at ' +
            'arunodaya (the 96 minutes before sunrise) or sunrise, and never before the Smarta day.',
        days: perMonth(CHAITRA, (m, loc) => {
            const smarta = tithiDay(m, 9, 'madhyahna', loc, 'second');
            const dawn = vaishnavaDay(tithiInMonth(m, 9), loc);
            const vaishnava = dawn > smarta ? dawn : smarta;
            return { first: smarta, last: smarta, vaishnava };
        }),
    },
    simple({
        id: 'mahavir-jayanti',
        name: 'Mahavir Jayanti',
        tradition: 'jain',
        month: CHAITRA,
        tithi: 13,
        kala: 'sunrise',
        rule: 'Chaitra Shukla Trayodashi, the day Trayodashi is current at sunrise.',
    }),
    simple({
        id: 'hanuman-jayanti',
        name: 'Hanuman Jayanti',
        month: CHAITRA,
        tithi: 15,
        kala: 'sunrise',
        rule: 'Chaitra Purnima (North Indian reckoning), the day Purnima is current at sunrise.',
    }),
    simple({
        id: 'akshaya-tritiya',
        name: 'Akshaya Tritiya',
        month: VAISHAKHA,
        tithi: 3,
        kala: 'purvahna',
        both: 'second-if-3-muhurtas',
        rule: 'Vaishakha Shukla Tritiya, the day Tritiya prevails in the forenoon (purvahna); when it ' +
            'does on two days, the second if Tritiya lasts three muhurtas after its sunrise.',
    }),
    simple({
        id: 'parshuram-jayanti',
        name: 'Parshuram Jayanti',
        month: VAISHAKHA,
        tithi: 3,
        kala: 'pradosh',
        both: 'second',
        none: 'before-start',
        rule: 'Vaishakha Shukla Tritiya, the evening Tritiya prevails in pradosh (Parashurama was born at ' +
            'dusk); the second if on both; if on neither, the evening before Tritiya begins.',
    }),
    simple({
        id: 'buddha-purnima',
        name: 'Buddha Purnima',
        tradition: 'buddhist',
        month: VAISHAKHA,
        tithi: 15,
        kala: 'sunrise',
        rule: 'Vaishakha Purnima, the day Purnima is current at sunrise.',
    }),
    simple({
        id: 'vat-savitri',
        name: 'Vat Savitri',
        month: VAISHAKHA,
        tithi: 30,
        kala: 'madhyahna',
        rule: 'Jyeshtha Amavasya in the purnimanta reckoning (amanta Vaishakha Amavasya), the day ' +
            'Amavasya prevails at madhyahna.',
    }),
    simple({
        id: 'ganga-dussehra',
        name: 'Ganga Dussehra',
        month: JYESHTHA,
        tithi: 10,
        kala: 'purvahna',
        adhik: 'keep-first',
        rule: 'Jyeshtha Shukla Dashami, the day Dashami prevails in the forenoon (purvahna). In a year ' +
            'with an adhik Jyeshtha it is kept in the adhik month.',
    }),
    simple({
        id: 'rath-yatra',
        name: 'Rath Yatra',
        month: ASHADHA,
        tithi: 2,
        kala: 'sunrise',
        rule: 'Ashadha Shukla Dwitiya, the day Dwitiya is current at sunrise.',
    }),
    simple({
        id: 'guru-purnima',
        name: 'Guru Purnima',
        month: ASHADHA,
        tithi: 15,
        kala: 'sunrise',
        rule: 'Ashadha Purnima (Vyasa Purnima), the day Purnima is current at sunrise.',
    }),
    simple({
        id: 'hariyali-teej',
        name: 'Hariyali Teej',
        month: SHRAVANA,
        tithi: 3,
        kala: 'sunrise',
        rule: 'Shravana Shukla Tritiya, the day Tritiya is current at sunrise.',
    }),
    simple({
        id: 'nag-panchami',
        name: 'Nag Panchami',
        month: SHRAVANA,
        tithi: 5,
        kala: 'sunrise',
        rule: 'Shravana Shukla Panchami, the day Panchami is current at sunrise.',
    }),
    {
        id: 'raksha-bandhan',
        name: 'Raksha Bandhan',
        tradition: 'hindu',
        rule: 'Shravana Purnima, on the day Purnima prevails in aparahna (the fourth fifth of daytime) ' +
            'free of bhadra. If bhadra covers it, the next day when Purnima lasts three muhurtas ' +
            'after that sunrise; otherwise the Purnima day, after bhadra ends.',
        days: perMonth(SHRAVANA, (m, loc) => single(purnimaWithoutBhadra(m, 'aparahna', loc))),
    },
    simple({
        id: 'kajari-teej',
        name: 'Kajari Teej',
        month: SHRAVANA,
        tithi: K(3),
        kala: 'sunrise',
        rule: 'Bhadrapada Krishna Tritiya (purnimanta; amanta Shravana Krishna Tritiya), the day Tritiya ' +
            'is current at sunrise.',
    }),
    {
        id: 'janmashtami',
        name: 'Krishna Janmashtami',
        tradition: 'hindu',
        rule: 'Krishna Ashtami of Bhadrapada (purnimanta; amanta Shravana). Smarta: the night Ashtami ' +
            'and Rohini nakshatra are together at nishita (Jayanti); else, when the day after the ' +
            'Ashtami midnight keeps Ashtami at sunrise, Rohini joins it that day and is there at ' +
            'nishita, that day; else the night Ashtami prevails at nishita (Krishna was born at ' +
            'midnight). Vaishnava: the first day Ashtami is current at arunodaya (the 96 minutes ' +
            'before sunrise) or sunrise, and never before the Smarta day.',
        days: perMonth(SHRAVANA, (m, loc) => {
            const iv = tithiInMonth(m, K(8));
            const smarta = smartaJanmashtami(iv, loc);
            // Vaishnavas keep the same day as Smartas or the day after, never before.
            const dawn = vaishnavaDay(iv, loc);
            const vaishnava = dawn > smarta ? dawn : smarta;
            return { first: smarta, last: smarta, vaishnava };
        }),
    },
    simple({
        id: 'hartalika-teej',
        name: 'Hartalika Teej',
        month: BHADRAPADA,
        tithi: 3,
        kala: 'sunrise',
        rule: 'Bhadrapada Shukla Tritiya, the day Tritiya is current at sunrise.',
    }),
    simple({
        id: 'ganesh-chaturthi',
        name: 'Ganesh Chaturthi',
        month: BHADRAPADA,
        tithi: 4,
        kala: 'madhyahna',
        both: 'more',
        rule: 'Bhadrapada Shukla Chaturthi, the day Chaturthi prevails at madhyahna (Ganesha was born at ' +
            'midday); on both days, the one it covers more.',
    }),
    {
        id: 'samvatsari',
        name: 'Samvatsari',
        tradition: 'jain',
        rule: 'Bhadrapada Shukla Chaturthi (Shvetambara), the day Chaturthi is current at sunrise; when it ' +
            'is current at two sunrises, the second.',
        days: perMonth(BHADRAPADA, (m, loc) => single(tithiDay(m, 4, 'sunrise', loc, 'second'))),
    },
    {
        id: 'paryushan',
        name: 'Paryushan',
        tradition: 'jain',
        rule: 'The eight days of the Shvetambara Paryushan, ending on Samvatsari.',
        days: perMonth(BHADRAPADA, (m, loc) => {
            const s = tithiDay(m, 4, 'sunrise', loc, 'second');
            return rangeOf(addDays(s, -7), s);
        }),
    },
    {
        id: 'das-lakshan',
        name: 'Das Lakshan',
        tradition: 'jain',
        rule: 'The Digambara Das Lakshan Parva, from Bhadrapada Shukla Panchami (the day it prevails at ' +
            'madhyahna) to Anant Chaturdashi (the day Chaturdashi is current at sunrise).',
        days: perMonth(BHADRAPADA, (m, loc) => rangeOf(tithiDay(m, 5, 'madhyahna', loc), tithiDay(m, 14, 'sunrise', loc))),
    },
    {
        id: 'navratri',
        name: 'Navratri',
        tradition: 'hindu',
        rule: 'Sharad Navratri, from Ghatasthapana (Ashwin Shukla Pratipada, the day it is current at ' +
            'sunrise and lasts at least a muhurta after it; else the day it begins) to Maha Navami (the ' +
            'day Navami prevails in aparahna).',
        days: perMonth(ASHWIN, (m, loc) => rangeOf(ghatasthapana(m, loc), tithiDay(m, 9, 'aparahna', loc))),
    },
    {
        id: 'durga-puja',
        name: 'Durga Puja',
        tradition: 'hindu',
        rule: 'From Maha Shashthi to Vijaya Dashami of Ashwin Shukla, each the day its tithi is current at sunrise.',
        days: perMonth(ASHWIN, (m, loc) => rangeOf(tithiDay(m, 6, 'sunrise', loc), tithiDay(m, 10, 'sunrise', loc))),
    },
    {
        id: 'dussehra',
        name: 'Dussehra',
        tradition: 'hindu',
        rule: 'Ashwin Shukla Dashami (Vijayadashami), the day Dashami prevails in aparahna; on both days, ' +
            'the one on which Shravana nakshatra joins Dashami in aparahna, else the first.',
        days: perMonth(ASHWIN, (m, loc) => single(dussehraDay(m, loc))),
    },
    simple({
        id: 'sharad-purnima',
        name: 'Sharad Purnima',
        month: ASHWIN,
        tithi: 15,
        kala: 'nishita',
        both: 'second',
        rule: 'Ashwin Purnima (Kojagara), the night Purnima prevails at nishita; the second if on both.',
    }),
    simple({
        id: 'karva-chauth',
        name: 'Karva Chauth',
        month: ASHWIN,
        tithi: K(4),
        kala: 'moonrise',
        rule: 'Kartika Krishna Chaturthi (purnimanta; amanta Ashwin Krishna Chaturthi), the day ' +
            'Chaturthi is current at moonrise; if at no moonrise, the day it is current at sunrise.',
    }),
    simple({
        id: 'ahoi-ashtami',
        name: 'Ahoi Ashtami',
        month: ASHWIN,
        tithi: K(8),
        kala: 'pradosh',
        rule: 'Kartika Krishna Ashtami (purnimanta; amanta Ashwin Krishna Ashtami), the day Ashtami ' +
            'prevails at dusk (pradosh), when the stars come out.',
    }),
    {
        id: 'diwali',
        name: 'Diwali',
        tradition: 'hindu',
        rule: 'Five days from Dhanteras to Bhai Dooj. Dhanteras: Krishna Trayodashi in pradosh. ' +
            'Lakshmi Puja: Amavasya in pradosh (amanta Ashwin, purnimanta Kartika). Govardhan Puja: ' +
            'Kartika Shukla Pratipada at sunrise. Bhai Dooj: Shukla Dwitiya in aparahna (the day it ' +
            'covers more of it).',
        days: (year, loc) => {
            const out = [];
            const months = lunarMonthsAround(year);
            for (let i = 0; i + 1 < months.length; i++) {
                const m = months[i];
                if (m.month !== ASHWIN || m.adhik)
                    continue;
                const next = months.slice(i + 1).find((x) => !x.adhik);
                const dhanteras = tithiDay(m, K(13), 'pradosh', loc);
                const lakshmi = tithiDay(m, 30, 'pradosh', loc);
                const govardhan = tithiDay(next, 1, 'sunrise', loc);
                const bhaiDooj = tithiDay(next, 2, 'aparahna', loc, 'more');
                if (!dhanteras.startsWith(`${year}-`))
                    continue;
                out.push(rangeOf(dhanteras, bhaiDooj, [
                    { name: 'Dhanteras', date: dhanteras },
                    { name: 'Lakshmi Puja', date: lakshmi },
                    { name: 'Govardhan Puja', date: govardhan },
                    { name: 'Bhai Dooj', date: bhaiDooj },
                ]));
            }
            return out;
        },
    },
    simple({
        id: 'kali-puja',
        name: 'Kali Puja',
        month: ASHWIN,
        tithi: 30,
        kala: 'nishita',
        rule: 'The Amavasya of Diwali, on the night Amavasya prevails at nishita (midnight).',
    }),
    {
        id: 'chhath-puja',
        name: 'Chhath Puja',
        tradition: 'hindu',
        rule: 'Four days around Kartika Shukla Shashthi: Nahay Khay, Kharna, Sandhya Arghya on the day ' +
            'Shashthi is current at sunrise, and Usha Arghya at the next sunrise.',
        days: perMonth(KARTIKA, (m, loc) => {
            const sandhya = tithiDay(m, 6, 'sunrise', loc);
            return rangeOf(addDays(sandhya, -2), addDays(sandhya, 1), [
                { name: 'Nahay Khay', date: addDays(sandhya, -2) },
                { name: 'Kharna', date: addDays(sandhya, -1) },
                { name: 'Sandhya Arghya', date: sandhya },
                { name: 'Usha Arghya', date: addDays(sandhya, 1) },
            ]);
        }),
    },
    simple({
        id: 'tulsi-vivah',
        name: 'Tulsi Vivah',
        month: KARTIKA,
        tithi: 12,
        kala: 'sunrise',
        rule: 'Kartika Shukla Dwadashi, the day Dwadashi is current at sunrise.',
    }),
    simple({
        id: 'guru-nanak-jayanti',
        name: 'Guru Nanak Jayanti',
        tradition: 'sikh',
        month: KARTIKA,
        tithi: 15,
        kala: 'sunrise',
        rule: 'Kartika Purnima (Gurpurab), the day Purnima is current at sunrise.',
    }),
    simple({
        id: 'dev-deepawali',
        name: 'Dev Deepawali',
        month: KARTIKA,
        tithi: 15,
        kala: 'pradosh',
        rule: 'Kartika Purnima, the evening Purnima prevails in pradosh, when the lamps are lit.',
    }),
    simple({
        id: 'vivah-panchami',
        name: 'Vivah Panchami',
        month: MARGASHIRSHA,
        tithi: 5,
        kala: 'sunrise',
        rule: 'Margashirsha Shukla Panchami, the day Panchami is current at sunrise.',
    }),
    simple({
        id: 'gita-jayanti',
        name: 'Gita Jayanti',
        month: MARGASHIRSHA,
        tithi: 11,
        kala: 'sunrise',
        both: 'second',
        rule: 'Margashirsha Shukla Ekadashi (Mokshada Ekadashi), the day Ekadashi is current at sunrise; ' +
            'when at two sunrises, the second.',
    }),
    simple({
        id: 'guru-gobind-singh-jayanti',
        name: 'Guru Gobind Singh Jayanti',
        tradition: 'sikh',
        month: PAUSHA,
        tithi: 7,
        kala: 'sunrise',
        rule: 'Pausha Shukla Saptami, the day Saptami is current at sunrise. A Gregorian year can have ' +
            'none or two.',
    }),
];
