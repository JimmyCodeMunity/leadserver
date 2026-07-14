const axios = require('axios');
const logger = require('../../utils/logger');
const { normalizeYelpBusiness } = require('./normalize');

const YELP_BASE = 'https://api.yelp.com/v3';

/**
 * Search Yelp Fusion API for businesses without websites.
 */
async function searchYelp(category, city, radiusMeters, onProgress) {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
        logger.warn('YELP_API_KEY not set, skipping Yelp');
        return [];
    }

    const results = [];
    const limit = 50;
    let offset = 0;
    let total = null;

    try {
        do {
            const response = await axios.get(`${YELP_BASE}/businesses/search`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                params: {
                    term: category,
                    location: city,
                    radius: Math.min(radiusMeters, 40000), // Yelp max 40km
                    limit,
                    offset,
                },
            });

            const data = response.data;
            const businesses = data.businesses || [];
            if (total === null) total = data.total || 0;

            for (let i = 0; i < businesses.length; i++) {
                if (onProgress) onProgress(offset + i, Math.min(total, 200));
                const normalized = normalizeYelpBusiness(businesses[i], category);
                if (normalized) results.push(normalized);
            }

            offset += businesses.length;

            if (businesses.length < limit) break;
            await sleep(500);
        } while (offset < Math.min(total, 200)); // cap at 200 results

        return results;
    } catch (err) {
        if (err.response?.status === 401) {
            logger.error('Yelp API: Unauthorized — check YELP_API_KEY');
        } else {
            logger.error({ err: err.message }, 'Yelp search failed');
        }
        return results;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchYelp };
