const axios = require('axios');
const logger = require('../../utils/logger');
const { normalizeGooglePlace } = require('./normalize');

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

/**
 * Search Google Places for businesses in a city by category.
 * Returns normalized lead objects (only no-website businesses).
 * @param {string} category - search keyword/category
 * @param {string} city - city name
 * @param {number} radiusMeters - search radius
 * @param {function} onProgress - callback(done, total)
 */
async function searchGooglePlaces(category, city, radiusMeters, onProgress) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        logger.warn('GOOGLE_PLACES_API_KEY not set, skipping Google Places');
        return [];
    }

    const results = [];
    let pageToken = null;
    let pageNum = 0;

    try {
        do {
            const params = {
                query: `${category} in ${city}`,
                key: apiKey,
                ...(radiusMeters && { radius: radiusMeters }),
                ...(pageToken && { pagetoken: pageToken }),
            };

            const response = await axios.get(`${PLACES_BASE}/textsearch/json`, { params });
            const data = response.data;

            if (data.status === 'REQUEST_DENIED') {
                logger.error({ message: data.error_message }, 'Google Places API denied');
                break;
            }
            if (data.status === 'INVALID_REQUEST') {
                logger.warn({ status: data.status }, 'Google Places invalid request');
                break;
            }

            const places = data.results || [];
            pageNum++;

            // Fetch details for each place to get phone + website
            for (let i = 0; i < places.length; i++) {
                const place = places[i];
                if (onProgress) onProgress(results.length + i, places.length * (pageNum));

                try {
                    const detailRes = await axios.get(`${PLACES_BASE}/details/json`, {
                        params: {
                            place_id: place.place_id,
                            fields: 'name,formatted_address,formatted_phone_number,international_phone_number,website,geometry,rating,user_ratings_total,vicinity',
                            key: apiKey,
                        },
                    });
                    const detail = detailRes.data?.result || place;
                    const normalized = normalizeGooglePlace(detail, category);
                    if (normalized) results.push(normalized);
                } catch (detailErr) {
                    logger.warn({ err: detailErr.message, placeId: place.place_id }, 'Failed to fetch place details');
                    const normalized = normalizeGooglePlace(place, category);
                    if (normalized) results.push(normalized);
                }

                // Small delay to respect rate limits
                await sleep(100);
            }

            pageToken = data.next_page_token || null;
            if (pageToken) await sleep(2000); // Google requires delay before next page
        } while (pageToken && pageNum < 3); // max 3 pages = 60 results

        return results;
    } catch (err) {
        logger.error({ err: err.message }, 'Google Places search failed');
        return results;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchGooglePlaces };
