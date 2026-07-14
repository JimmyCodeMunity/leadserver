/**
 * Normalize business data from any provider into the common Lead schema shape.
 * Returns null if the business has a website (we only want no-website leads).
 */

function normalizeGooglePlace(place, category) {
    if (place.website && place.website.trim()) return null;

    const lat = place.geometry?.location?.lat || 0;
    const lng = place.geometry?.location?.lng || 0;

    return {
        businessName: place.name || '',
        category,
        phone: place.formatted_phone_number || place.international_phone_number || '',
        address: place.formatted_address || place.vicinity || '',
        location: { type: 'Point', coordinates: [lng, lat] },
        source: 'google_places',
        hasWebsite: false,
        websiteUrl: '',
        externalId: place.place_id || '',
        rating: place.rating || null,
        reviewCount: place.user_ratings_total || 0,
        socialLinks: { tiktok: '', instagram: '', facebook: '', other: '' },
    };
}

function normalizeYelpBusiness(biz, category) {
    if (biz.attributes?.business_url || biz.website) return null;

    const lat = biz.coordinates?.latitude || 0;
    const lng = biz.coordinates?.longitude || 0;
    const address = [
        biz.location?.address1,
        biz.location?.city,
        biz.location?.state,
        biz.location?.country,
    ].filter(Boolean).join(', ');

    return {
        businessName: biz.name || '',
        category,
        phone: biz.phone || biz.display_phone || '',
        address,
        location: { type: 'Point', coordinates: [lng, lat] },
        source: 'yelp',
        hasWebsite: false,
        websiteUrl: '',
        externalId: biz.id || '',
        rating: biz.rating || null,
        reviewCount: biz.review_count || 0,
        socialLinks: { tiktok: '', instagram: '', facebook: '', other: '' },
    };
}

function normalizeOsmElement(el, category) {
    const tags = el.tags || {};

    if (tags.website || tags['contact:website']) return null;

    const lat = el.lat || el.center?.lat || 0;
    const lng = el.lon || el.center?.lon || 0;

    const address = [
        tags['addr:housenumber'],
        tags['addr:street'],
        tags['addr:city'],
        tags['addr:country'],
    ].filter(Boolean).join(', ') || tags['addr:full'] || '';

    const name = tags.name || tags['name:en'] || '';
    if (!name) return null;

    // Extract phone — OSM uses multiple phone tag formats
    const phone =
        tags.phone ||
        tags['contact:phone'] ||
        tags['phone:mobile'] ||
        tags['contact:mobile'] ||
        tags['telephone'] ||
        '';

    return {
        businessName: name,
        category: tags.amenity || tags.shop || tags.tourism || category,
        phone,
        address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        location: { type: 'Point', coordinates: [lng, lat] },
        source: 'osm',
        hasWebsite: false,
        websiteUrl: '',
        externalId: `osm-${el.type}-${el.id}`,
        rating: null,
        reviewCount: 0,
        socialLinks: {
            tiktok: '',
            instagram: tags['contact:instagram'] || tags['social:instagram'] || '',
            facebook: tags['contact:facebook'] || tags['social:facebook'] || '',
            other: '',
        },
    };
}

/**
 * Deduplication key — normalized name + address, case-insensitive.
 */
function dedupeKey(businessName, address) {
    return `${businessName.toLowerCase().replace(/\s+/g, ' ').trim()}|${address.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

module.exports = {
    normalizeGooglePlace,
    normalizeYelpBusiness,
    normalizeOsmElement,
    dedupeKey,
};
