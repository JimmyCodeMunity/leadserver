const axios = require('axios');
const logger = require('../../utils/logger');
const { normalizeOsmElement } = require('./normalize');

// Overpass API endpoints — rotate on failure
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/**
 * Query OpenStreetMap Overpass API for businesses by category in a city.
 * Free — no API key required.
 *
 * Strategy: geocode the city name to a bounding box first using Nominatim,
 * then run an Overpass bbox query. This is more reliable than area-name lookups.
 */
async function searchOSM(category, city, radiusMeters, onProgress) {
    // Step 1: Get bounding box for the city via Nominatim
    const bbox = await geocodeCity(city, radiusMeters);
    if (!bbox) {
        logger.warn({ city }, 'OSM: Could not geocode city, skipping');
        return [];
    }

    const { south, west, north, east } = bbox;
    const osmTags = mapCategoryToOSMTags(category);

    // Build Overpass QL query using bbox (no area name lookup needed)
    const tagUnion = osmTags
        .map((tag) => `  node[${tag}](${south},${west},${north},${east});\n  way[${tag}](${south},${west},${north},${east});`)
        .join('\n');

    const query = `[out:json][timeout:40];
(
${tagUnion}
);
out body center;`;

    logger.debug({ city, bbox, query }, 'OSM Overpass query');

    // Step 2: Try each Overpass endpoint until one works
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const response = await axios({
                method: 'POST',
                url: endpoint,
                // Send as plain text body — Overpass accepts raw QL directly
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'User-Agent': 'LeadScout/1.0 (lead discovery tool)',
                    Accept: 'application/json',
                },
                data: query,
                timeout: 45000,
            });

            const elements = response.data?.elements || [];
            logger.info({ endpoint, count: elements.length, city }, 'OSM results fetched');

            const results = [];
            for (let i = 0; i < elements.length; i++) {
                if (onProgress) onProgress(i, elements.length);
                const normalized = normalizeOsmElement(elements[i], category);
                if (normalized) results.push(normalized);
                if (i % 50 === 0) await sleep(10);
            }
            return results;
        } catch (err) {
            const status = err.response?.status;
            logger.warn({ endpoint, status, err: err.message }, 'OSM endpoint failed, trying next');
            if (status === 429) {
                // Rate limited — wait before retrying next endpoint
                await sleep(3000);
            }
        }
    }

    logger.error({ city }, 'All OSM Overpass endpoints failed');
    return [];
}

/**
 * Geocode a city name to a bounding box using Nominatim.
 * Returns { south, west, north, east } or null.
 */
async function geocodeCity(city, radiusMeters = 5000) {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: city,
                format: 'json',
                limit: 1,
                featuretype: 'city,town,village,municipality',
            },
            headers: {
                'User-Agent': 'LeadScout/1.0 (lead discovery tool)',
                Accept: 'application/json',
            },
            timeout: 10000,
        });

        const results = response.data;
        if (!results || results.length === 0) {
            // Fallback: try without featuretype filter
            const fallback = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: { q: city, format: 'json', limit: 1 },
                headers: { 'User-Agent': 'LeadScout/1.0', Accept: 'application/json' },
                timeout: 10000,
            });
            if (!fallback.data || fallback.data.length === 0) return null;
            return boundingBoxFromResult(fallback.data[0], radiusMeters);
        }

        return boundingBoxFromResult(results[0], radiusMeters);
    } catch (err) {
        logger.warn({ err: err.message, city }, 'Nominatim geocoding failed');
        return null;
    }
}

/**
 * Build a bounding box from a Nominatim result.
 * If the result already has a bbox, use it (expanded slightly).
 * Otherwise pad around the lat/lon using the radius.
 */
function boundingBoxFromResult(result, radiusMeters) {
    if (result.boundingbox && result.boundingbox.length === 4) {
        const [s, n, w, e] = result.boundingbox.map(Number);
        // Expand the bbox a little to catch edge businesses
        const padLat = 0.02;
        const padLon = 0.02;
        return { south: s - padLat, west: w - padLon, north: n + padLat, east: e + padLon };
    }

    // Pad around center point using radius
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const degLat = radiusMeters / 111320;
    const degLon = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
    return {
        south: lat - degLat,
        west: lon - degLon,
        north: lat + degLat,
        east: lon + degLon,
    };
}

/**
 * Map a free-text category to one or more Overpass OSM tag filters.
 * Returns an array of tag strings like 'amenity="restaurant"' or 'amenity~"restaurant|cafe"'
 */
function mapCategoryToOSMTags(category) {
    const lower = category.toLowerCase();

    if (lower.includes('restaurant') || lower.includes('food')) {
        return ['amenity="restaurant"', 'amenity="fast_food"', 'amenity="food_court"'];
    }
    if (lower.includes('cafe') || lower.includes('coffee')) {
        return ['amenity="cafe"'];
    }
    if (lower.includes('bar') || lower.includes('pub')) {
        return ['amenity="bar"', 'amenity="pub"'];
    }
    if (lower.includes('salon') || lower.includes('hair') || lower.includes('beauty')) {
        return ['shop="hairdresser"', 'shop="beauty"'];
    }
    if (lower.includes('barber')) {
        return ['shop="hairdresser"', 'amenity="barbers"'];
    }
    if (lower.includes('auto') || lower.includes('car repair') || lower.includes('mechanic')) {
        return ['shop="car_repair"', 'amenity="car_repair"'];
    }
    if (lower.includes('car dealer') || lower.includes('auto dealer')) {
        return ['shop="car"'];
    }
    if (lower.includes('gym') || lower.includes('fitness')) {
        return ['leisure="fitness_centre"', 'leisure="sports_centre"'];
    }
    if (lower.includes('hotel') || lower.includes('lodge') || lower.includes('motel')) {
        return ['tourism="hotel"', 'tourism="motel"', 'tourism="guest_house"'];
    }
    if (lower.includes('clinic') || lower.includes('doctor') || lower.includes('medical')) {
        return ['amenity="clinic"', 'amenity="doctors"'];
    }
    if (lower.includes('hospital')) {
        return ['amenity="hospital"'];
    }
    if (lower.includes('pharmacy') || lower.includes('chemist')) {
        return ['amenity="pharmacy"', 'shop="chemist"'];
    }
    if (lower.includes('school') || lower.includes('college')) {
        return ['amenity="school"', 'amenity="college"'];
    }
    if (lower.includes('supermarket') || lower.includes('grocery')) {
        return ['shop="supermarket"', 'shop="convenience"'];
    }
    if (lower.includes('shop') || lower.includes('store') || lower.includes('retail')) {
        return ['shop'];
    }
    if (lower.includes('hotel') || lower.includes('accommodation')) {
        return ['tourism="hotel"', 'tourism="hostel"'];
    }
    if (lower.includes('plumb')) {
        return ['craft="plumber"'];
    }
    if (lower.includes('electric')) {
        return ['craft="electrician"'];
    }
    if (lower.includes('dentist')) {
        return ['amenity="dentist"'];
    }
    if (lower.includes('photographer')) {
        return ['craft="photographer"'];
    }
    if (lower.includes('clean')) {
        return ['craft="cleaning"', 'shop="cleaning"'];
    }

    // Generic fallback: search by name tag — less precise but catches anything
    // Use a simple equality on amenity or shop with the category text
    const safe = category.replace(/"/g, '');
    return [`name~"${safe}",i`];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchOSM };
