const { normalizeGooglePlace, normalizeYelpBusiness, normalizeOsmElement, dedupeKey } = require('../services/discovery/normalize');

describe('normalizeGooglePlace', () => {
    it('returns null when business has a website', () => {
        const place = {
            name: 'Test Biz',
            website: 'https://testbiz.com',
            formatted_address: '123 Main St',
            geometry: { location: { lat: 1, lng: 2 } },
        };
        expect(normalizeGooglePlace(place, 'restaurant')).toBeNull();
    });

    it('returns normalized object when no website', () => {
        const place = {
            name: 'No Website Diner',
            place_id: 'abc123',
            formatted_address: '456 Oak Ave, Nairobi',
            formatted_phone_number: '+254 700 000001',
            geometry: { location: { lat: -1.2921, lng: 36.8219 } },
            rating: 4.2,
            user_ratings_total: 88,
        };
        const result = normalizeGooglePlace(place, 'restaurant');
        expect(result).not.toBeNull();
        expect(result.businessName).toBe('No Website Diner');
        expect(result.source).toBe('google_places');
        expect(result.hasWebsite).toBe(false);
        expect(result.location.coordinates).toEqual([36.8219, -1.2921]);
    });
});

describe('normalizeYelpBusiness', () => {
    it('returns null for businesses with a website', () => {
        const biz = {
            name: 'Has Web',
            attributes: { business_url: 'http://hasweb.com' },
            coordinates: { latitude: 0, longitude: 0 },
            location: { address1: '1 Main', city: 'City', state: 'ST', country: 'US' },
        };
        expect(normalizeYelpBusiness(biz, 'cafe')).toBeNull();
    });

    it('returns normalized object for no-website business', () => {
        const biz = {
            id: 'yelp-xyz',
            name: 'Local Cafe',
            phone: '+1234567890',
            rating: 3.5,
            review_count: 20,
            coordinates: { latitude: 40.7128, longitude: -74.006 },
            location: { address1: '1 Broadway', city: 'New York', state: 'NY', country: 'US' },
        };
        const result = normalizeYelpBusiness(biz, 'cafe');
        expect(result).not.toBeNull();
        expect(result.source).toBe('yelp');
        expect(result.businessName).toBe('Local Cafe');
    });
});

describe('dedupeKey', () => {
    it('generates consistent keys regardless of case/spacing', () => {
        const k1 = dedupeKey('  Test Business  ', '123 Main St, City');
        const k2 = dedupeKey('test business', '123 main st, city');
        expect(k1).toBe(k2);
    });

    it('generates different keys for different businesses', () => {
        const k1 = dedupeKey('Biz A', '123 Main St');
        const k2 = dedupeKey('Biz B', '123 Main St');
        expect(k1).not.toBe(k2);
    });
});
