// Festivals of the sidereal solar year: sankrantis (the Sun entering a
// sign of the Lahiri zodiac), the regional new years that start with
// Mesha, and the Tamil and Malayalam days fixed by a nakshatra inside a
// solar month.
import { single } from '../festival.js';
import { sankranti, tithiAt } from '../panchang.js';
import { kalaDay, nakshatraIntervals, solarDay, solarMonthStart, udayaDay, } from '../rules.js';
import { sunrise } from '../astro.js';
import { addDays, localDate, zonedMidnight } from '../time.js';
const MESHA = 0;
const SIMHA = 4;
const VRISCHIKA = 7;
const MAKARA = 9;
/** A festival on (or a fixed number of days from) a sankranti's day. */
function sankrantiFestival(id, name, rashi, reckoning, rule, offset = 0, tradition = 'hindu') {
    return {
        id,
        name,
        tradition,
        rule,
        days: (year, loc) => {
            const out = [];
            for (const y of [year - 1, year, year + 1]) {
                const d = addDays(solarDay(sankranti(rashi, y), loc, reckoning), offset);
                if (d.startsWith(`${year}-`) && !out.some((o) => o.first === d))
                    out.push(single(d));
            }
            return out;
        },
    };
}
/** The local days on which nakshatra `index` falls under `rule`, between two days. */
export function starDays(index, from, to, loc, rule) {
    const lo = zonedMidnight(addDays(from, -1), loc.timeZone);
    const hi = zonedMidnight(addDays(to, 2), loc.timeZone);
    const out = [];
    for (const iv of nakshatraIntervals(index, lo, hi)) {
        let d;
        if (rule === 'udaya')
            d = udayaDay(iv, loc, 'first', 1);
        else if (rule === 'six-nazhika')
            d = kalaDay(iv, 'six-nazhika', loc, 'first');
        else if (rule === 'madhyahna')
            d = kalaDay(iv, 'madhyahna', loc, 'first');
        else
            d = kalaDay(iv, 'sunset', loc, 'first');
        if (d >= from && d <= to && !out.includes(d))
            out.push(d);
    }
    return out;
}
/**
 * The day a nakshatra falls inside a solar month (in a regional
 * reckoning of the month's start). When it falls twice, the one nearer
 * Purnima (Thaipusam, Karthigai) or the first (Onam) is taken.
 */
function starInSolarMonth(rashi, nakshatra, reckoning, year, loc, rule, pick) {
    const start = solarMonthStart(rashi, year, loc, reckoning);
    const nextYear = rashi === 11 ? year + 1 : year;
    const end = addDays(solarMonthStart((rashi + 1) % 12, nextYear, loc, reckoning), -1);
    const days = starDays(nakshatra, start, end, loc, rule);
    if (days.length === 0)
        return null;
    if (pick === 'first' || days.length === 1)
        return days[0];
    const distance = (d) => {
        const t = tithiAt(sunrise(d, loc));
        return Math.min(Math.abs(t - 15), 30 - Math.abs(t - 15));
    };
    return [...days].sort((a, b) => distance(a) - distance(b))[0];
}
export const SOLAR_FESTIVALS = [
    sankrantiFestival('makar-sankranti', 'Makar Sankranti', MAKARA, 'tamil', 'The day the Sun enters sidereal Makara (Capricorn); when the ingress is after sunset, the ' +
        'next day, which holds the punya kaal.'),
    sankrantiFestival('uttarayan', 'Uttarayan', MAKARA, 'tamil', 'Gujarat\'s kite festival, on Makar Sankranti.'),
    sankrantiFestival('pongal', 'Thai Pongal', MAKARA, 'tamil', 'Thai 1, the first day of the Tamil solar month Thai: the day the Sun enters Makara, or the ' +
        'next day when it enters after sunset.'),
    sankrantiFestival('lohri', 'Lohri', MAKARA, 'tamil', 'The eve of Makar Sankranti.', -1, 'sikh'),
    sankrantiFestival('bhogi', 'Bhogi', MAKARA, 'tamil', 'The day before Thai Pongal.', -1),
    sankrantiFestival('magh-bihu', 'Magh Bihu', MAKARA, 'bengali', 'Magh 1 of the Assamese solar calendar: the day after the Sun enters Makara.'),
    sankrantiFestival('baisakhi', 'Baisakhi', MESHA, 'civil', 'Vaisakh 1 in Punjab: the local day the Sun enters sidereal Mesha (Aries).', 0, 'sikh'),
    {
        id: 'bihu',
        name: 'Rongali Bihu',
        tradition: 'hindu',
        rule: 'From the day the Sun enters Mesha (Goru Bihu, the last day of Chot) to Bohag 1, the next ' +
            'day (Manuh Bihu).',
        days: (year, loc) => {
            const at = sankranti(MESHA, year);
            const d = localDate(at, loc.timeZone);
            return [{ first: d, last: solarDay(at, loc, 'bengali') }];
        },
    },
    sankrantiFestival('vishu', 'Vishu', MESHA, 'next-sunrise', 'The Kerala new year: Vishukkani is seen at the first sunrise after the Sun enters Mesha.'),
    sankrantiFestival('puthandu', 'Puthandu', MESHA, 'tamil', 'Chithirai 1, the Tamil new year: the day the Sun enters Mesha, or the next day when it ' +
        'enters after sunset.'),
    sankrantiFestival('pohela-boishakh', 'Pohela Boishakh', MESHA, 'bengali', 'Boishakh 1, the Bengali new year (West Bengal reckoning): the day after the Sun enters Mesha.'),
    {
        id: 'onam',
        name: 'Onam',
        tradition: 'hindu',
        rule: 'From Atham (Hasta nakshatra) to Thiruvonam (Shravana nakshatra) in the Malayalam month ' +
            'Chingam (Sun in sidereal Simha). Thiruvonam is the day whose star, read six nazhikas ' +
            '(144 minutes) after sunrise as Kerala names a day\'s star, is Shravana; Atham is the day ' +
            'before it on which Hasta prevails at midday. Chingam starts on the day of the ingress if ' +
            'it comes before the end of madhyahna, else the next day.',
        days: (year, loc) => {
            const thiruvonam = starInSolarMonth(SIMHA, 21, 'malayalam', year, loc, 'six-nazhika', 'first');
            if (!thiruvonam)
                return [];
            const atham = starDays(12, addDays(thiruvonam, -13), addDays(thiruvonam, -1), loc, 'madhyahna');
            const first = atham[atham.length - 1] ?? addDays(thiruvonam, -10);
            return [
                {
                    first,
                    last: thiruvonam,
                    parts: [
                        { name: 'Atham', date: first },
                        { name: 'Thiruvonam', date: thiruvonam },
                    ],
                },
            ];
        },
    },
    {
        id: 'thaipusam',
        name: 'Thaipusam',
        tradition: 'hindu',
        rule: 'The day Pusam (Pushya) nakshatra is current at sunrise, lasting at least a muhurta after ' +
            'it, in the Tamil month Thai (Sun in sidereal Makara); if twice, the one nearer Purnima.',
        days: (year, loc) => {
            const d = starInSolarMonth(MAKARA, 7, 'tamil', year, loc, 'udaya', 'near-purnima');
            return d ? [single(d)] : [];
        },
    },
    {
        id: 'karthigai-deepam',
        name: 'Karthigai Deepam',
        tradition: 'hindu',
        rule: 'The evening Karthigai (Krittika) nakshatra is current at sunset, when the lamps are lit, in ' +
            'the Tamil month Karthigai (Sun in sidereal Vrischika); at no sunset, the day it is current ' +
            'at sunrise; if twice in the month, the one nearer Purnima.',
        days: (year, loc) => {
            const d = starInSolarMonth(VRISCHIKA, 2, 'tamil', year, loc, 'sunset', 'near-purnima');
            return d ? [single(d)] : [];
        },
    },
];
