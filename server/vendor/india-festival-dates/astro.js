// The astronomy the panchang needs, on top of astronomy-engine: the Sun's
// and Moon's longitudes (tropical and sidereal), the Lahiri ayanamsa,
// sunrise, sunset and moonrise, and searches for the instants a longitude
// or an elongation reaches a value. Every instant is UTC milliseconds.
import { AstroTime, Body, EclipticGeoMoon, MoonPhase, Observer, Search, SearchMoonPhase, SearchRiseSet, SearchSunLongitude, SunPosition, e_tilt, } from 'astronomy-engine';
import { addDays, zonedMidnight } from './time.js';
const DAY_MS = 86_400_000;
function toTime(ms) {
    return new AstroTime(new Date(ms));
}
function norm360(x) {
    const r = x % 360;
    return r < 0 ? r + 360 : r;
}
/** Julian centuries (TT) since J2000.0. */
function centuries(t) {
    return t.tt / 36525;
}
/**
 * The Lahiri (Chitrapaksha) ayanamsa, measured from the mean equinox of
 * date, in degrees.
 *
 * The Indian Calendar Reform Committee (1955) fixed it at 23°15'00.658" on
 * 21 March 1956, 0h ET, including nutation; without nutation that is
 * 23.245524743° at JD 2435553.5. It grows with the general precession in
 * longitude (IAU 2006: 5028.796195" T + 1.1054348" T² per Julian century).
 * Carried to J2000.0 that gives 23.857119°.
 */
export function lahiriAyanamsa(ms) {
    const T = centuries(toTime(ms));
    const precession = (5028.796195 * T + 1.1054348 * T * T) / 3600;
    return 23.857119 + precession;
}
/** Nutation in longitude, degrees (cancels between true longitude and true ayanamsa). */
function nutationLongitude(t) {
    return e_tilt(t).dpsi / 3600;
}
/** The Sun's apparent tropical longitude, degrees. */
export function sunTropical(ms) {
    return SunPosition(toTime(ms)).elon;
}
/** The Sun's sidereal (nirayana, Lahiri) longitude, degrees 0–360. */
export function sunSidereal(ms) {
    const t = toTime(ms);
    return norm360(SunPosition(t).elon - nutationLongitude(t) - lahiriAyanamsa(ms));
}
/** The Moon's sidereal (nirayana, Lahiri) longitude, degrees 0–360. */
export function moonSidereal(ms) {
    const t = toTime(ms);
    return norm360(EclipticGeoMoon(t).lon - nutationLongitude(t) - lahiriAyanamsa(ms));
}
/** The Moon's elongation from the Sun along the ecliptic, degrees 0–360. */
export function elongation(ms) {
    return MoonPhase(toTime(ms));
}
/** The first instant after `fromMs` when the elongation reaches `angle`. */
export function searchElongation(angle, fromMs, limitDays = 40) {
    const t = SearchMoonPhase(norm360(angle), toTime(fromMs), limitDays);
    if (!t)
        throw new Error(`No elongation ${angle}° within ${limitDays} days`);
    return t.date.getTime();
}
/** The first new moon after `fromMs`. */
export function nextNewMoon(fromMs) {
    return searchElongation(0, fromMs, 40);
}
/** The last new moon at or before `ms`. */
export function previousNewMoon(ms) {
    let t = searchElongation(0, ms - 31 * DAY_MS, 40);
    for (;;) {
        const next = searchElongation(0, t + DAY_MS, 40);
        if (next > ms)
            return t;
        t = next;
    }
}
/** The first instant after `fromMs` when the Sun's tropical longitude is `lon`. */
export function searchSunTropical(lon, fromMs, limitDays = 400) {
    const t = SearchSunLongitude(norm360(lon), toTime(fromMs), limitDays);
    if (!t)
        throw new Error(`No solar longitude ${lon}° within ${limitDays} days`);
    return t.date.getTime();
}
/**
 * The first instant after `fromMs` when the Sun's sidereal longitude is
 * `lon`: a sankranti when `lon` is a multiple of 30°.
 */
export function searchSunSidereal(lon, fromMs, limitDays = 400) {
    const target = norm360(lon);
    // Signed distance of the Sun past the target, in (-180, 180].
    const past = (ms) => {
        const d = norm360(sunSidereal(ms) - target);
        return d > 180 ? d - 360 : d;
    };
    // The Sun moves 0.95–1.02°/day: start a little before the expected day.
    const aheadDeg = norm360(target - sunSidereal(fromMs));
    let lo = fromMs + Math.max(0, aheadDeg / 1.02 - 2) * DAY_MS;
    const limit = fromMs + limitDays * DAY_MS;
    while (lo < limit) {
        const hi = lo + 5 * DAY_MS;
        if (past(lo) < 0 && past(hi) >= 0) {
            const t = Search((at) => past(at.date.getTime()), toTime(lo), toTime(hi), {
                dt_tolerance_seconds: 1,
            });
            if (!t)
                break;
            return t.date.getTime();
        }
        lo = hi;
    }
    throw new Error(`No sidereal solar longitude ${lon}° within ${limitDays} days`);
}
function observer(loc) {
    return new Observer(loc.latitude, loc.longitude, loc.elevation ?? 0);
}
const riseCache = new Map();
function riseSet(body, direction, date, loc) {
    const key = `${body}|${direction}|${date}|${loc.latitude}|${loc.longitude}|${loc.timeZone}`;
    const hit = riseCache.get(key);
    if (hit !== undefined)
        return hit;
    const start = zonedMidnight(date, loc.timeZone);
    const end = zonedMidnight(addDays(date, 1), loc.timeZone);
    const t = SearchRiseSet(body, observer(loc), direction, toTime(start), (end - start) / DAY_MS);
    const ms = t ? t.date.getTime() : null;
    if (riseCache.size > 50_000)
        riseCache.clear();
    riseCache.set(key, ms);
    return ms;
}
/**
 * Sunrise on a local day: the upper limb on the horizon with standard
 * refraction, as almanacs give it.
 */
export function sunrise(date, loc) {
    const t = riseSet(Body.Sun, 1, date, loc);
    if (t === null)
        throw new RangeError(`No sunrise on ${date} at this latitude`);
    return t;
}
/** Sunset on a local day. */
export function sunset(date, loc) {
    const t = riseSet(Body.Sun, -1, date, loc);
    if (t === null)
        throw new RangeError(`No sunset on ${date} at this latitude`);
    return t;
}
/** The first moonset after an instant (within two days), or null. */
export function moonsetAfter(ms, loc) {
    const t = SearchRiseSet(Body.Moon, observer(loc), -1, toTime(ms), 2);
    return t ? t.date.getTime() : null;
}
/** Moonrise on a local day, or null when the Moon does not rise that day. */
export function moonrise(date, loc) {
    return riseSet(Body.Moon, 1, date, loc);
}
