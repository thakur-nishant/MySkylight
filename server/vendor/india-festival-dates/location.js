// Where the festival is observed. Tithis are read at local sunrise, sunset
// and other times of day, so the same festival can fall on different
// calendar days in different cities.
/** The seven reference cities, one per region. */
export const PRESETS = {
    'new-delhi': {
        name: 'New Delhi',
        latitude: 28.6139,
        longitude: 77.209,
        timeZone: 'Asia/Kolkata',
        country: 'IN',
    },
    toronto: {
        name: 'Toronto',
        latitude: 43.6532,
        longitude: -79.3832,
        timeZone: 'America/Toronto',
        country: 'CA',
    },
    vancouver: {
        name: 'Vancouver',
        latitude: 49.2827,
        longitude: -123.1207,
        timeZone: 'America/Vancouver',
        country: 'CA',
    },
    london: {
        name: 'London',
        latitude: 51.5074,
        longitude: -0.1278,
        timeZone: 'Europe/London',
        country: 'GB',
    },
    dubai: {
        name: 'Dubai',
        latitude: 25.2048,
        longitude: 55.2708,
        timeZone: 'Asia/Dubai',
        country: 'AE',
    },
    singapore: {
        name: 'Singapore',
        latitude: 1.3521,
        longitude: 103.8198,
        timeZone: 'Asia/Singapore',
        country: 'SG',
    },
    sydney: {
        name: 'Sydney',
        latitude: -33.8688,
        longitude: 151.2093,
        timeZone: 'Australia/Sydney',
        country: 'AU',
    },
};
