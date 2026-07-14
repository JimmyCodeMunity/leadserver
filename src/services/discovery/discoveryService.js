const Lead = require('../../models/Lead');
const SavedSearch = require('../../models/SavedSearch');
const { searchGooglePlaces } = require('./googlePlaces');
const { searchYelp } = require('./yelp');
const { searchOSM } = require('./osm');
const { dedupeKey } = require('./normalize');
const logger = require('../../utils/logger');
const { randomUUID } = require('crypto');

// In-memory job store
const jobs = new Map();

function createJob(id) {
    const job = {
        id,
        status: 'queued', // queued | running | done | failed
        progress: { done: 0, total: 0, phase: '' },
        result: null,
        error: null,
        createdAt: new Date(),
    };
    jobs.set(id, job);
    return job;
}

function getJob(id) {
    return jobs.get(id) || null;
}

/**
 * Run discovery for a given category+city+radius using specified providers.
 * @param {string|null} maxLeads - cap how many leads get saved to DB (null = all)
 */
async function runDiscovery({ jobId, category, city, radiusMeters, providers, maxLeads, ownerId }) {
    const job = jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.progress.phase = `Initializing — ${category} in ${city}`;

    logger.info({ jobId, category, city, radiusMeters, providers, maxLeads }, 'Discovery job started');

    try {
        const allResults = [];

        for (const provider of providers) {
            const onProgress = (done, total) => {
                job.progress.done = done;
                job.progress.total = total;
                job.progress.phase = `Scanning ${city} — ${category} via ${providerLabel(provider)}`;
            };

            job.progress.phase = `Starting ${providerLabel(provider)} scan…`;

            let providerResults = [];
            if (provider === 'google_places') {
                providerResults = await searchGooglePlaces(category, city, radiusMeters, onProgress);
            } else if (provider === 'yelp') {
                providerResults = await searchYelp(category, city, radiusMeters, onProgress);
            } else if (provider === 'osm') {
                providerResults = await searchOSM(category, city, radiusMeters, onProgress);
            }

            logger.info({ provider, count: providerResults.length }, 'Provider results fetched');
            allResults.push(...providerResults);
        }

        // In-memory dedup across providers in this batch
        const seen = new Set();
        const deduplicated = allResults.filter((r) => {
            const key = dedupeKey(r.businessName, r.address);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Apply maxLeads cap — take the first N results
        const toSave = maxLeads ? deduplicated.slice(0, maxLeads) : deduplicated;

        job.progress.phase = `Saving ${toSave.length} leads to database…`;
        job.progress.done = 0;
        job.progress.total = toSave.length;

        let savedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < toSave.length; i++) {
            const lead = toSave[i];
            job.progress.done = i + 1;

            try {
                const existing = await Lead.findOne({
                    businessName: lead.businessName,
                    address: lead.address,
                    owner: ownerId,
                }).collation({ locale: 'en', strength: 2 });

                if (existing) {
                    skippedCount++;
                } else {
                    await Lead.create({ ...lead, owner: ownerId, discoveredAt: new Date() });
                    savedCount++;
                }
            } catch (err) {
                if (err.code === 11000) {
                    skippedCount++;
                } else {
                    logger.warn({ err: err.message, business: lead.businessName }, 'Failed to save lead');
                }
            }
        }

        job.status = 'done';
        job.progress.phase = 'Complete';
        job.result = {
            found: allResults.length,
            deduplicated: deduplicated.length,
            capped: maxLeads ? deduplicated.length > maxLeads : false,
            saved: savedCount,
            skipped: skippedCount,
        };

        logger.info({ jobId, ...job.result }, 'Discovery job complete');
    } catch (err) {
        job.status = 'failed';
        job.error = err.message;
        logger.error({ jobId, err: err.message }, 'Discovery job failed');
    }
}

function providerLabel(p) {
    const labels = { google_places: 'Google Places', yelp: 'Yelp', osm: 'OpenStreetMap' };
    return labels[p] || p;
}

async function runScheduledSearches() {
    try {
        const searches = await SavedSearch.find({ schedule: { $ne: null }, isPaused: false });
        for (const search of searches) {
            const jobId = randomUUID();
            createJob(jobId);
            runDiscovery({
                jobId,
                category: search.category,
                city: search.city,
                radiusMeters: search.radiusMeters,
                providers: search.providers,
                maxLeads: null,
                ownerId: search.owner,
            });
            await SavedSearch.findByIdAndUpdate(search._id, { lastRunAt: new Date() });
        }
    } catch (err) {
        logger.error({ err: err.message }, 'Scheduled search run failed');
    }
}

module.exports = { runDiscovery, createJob, getJob, runScheduledSearches };
