const router = require('express').Router();
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { runDiscovery, createJob, getJob } = require('../services/discovery/discoveryService');

router.use(authenticate);

const discoveryLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: { message: 'Too many discovery requests, please wait', code: 'RATE_LIMITED' } },
    keyGenerator: (req) => req.user._id.toString(),
});

const discoverySchema = z.object({
    category: z.string().min(1).max(100),
    city: z.string().min(1).max(100),
    radiusMeters: z.number().min(500).max(50000).default(5000),
    providers: z.array(z.enum(['google_places', 'yelp', 'osm'])).min(1).default(['google_places']),
    maxLeads: z.number().min(1).max(5000).nullable().optional(), // null = save all
});

// POST /api/discovery/run
router.post('/run', discoveryLimiter, validate(discoverySchema), (req, res) => {
    const { category, city, radiusMeters, providers, maxLeads } = req.validatedBody;
    const jobId = uuidv4();

    createJob(jobId);

    // Fire and forget — don't await
    runDiscovery({
        jobId,
        category,
        city,
        radiusMeters,
        providers,
        maxLeads: maxLeads || null,
        ownerId: req.user._id,
    });

    res.status(202).json({ jobId, message: 'Discovery job started' });
});

// GET /api/discovery/jobs/:id
router.get('/jobs/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
        return res.status(404).json({ error: { message: 'Job not found', code: 'NOT_FOUND' } });
    }
    res.json({ job });
});

module.exports = router;
