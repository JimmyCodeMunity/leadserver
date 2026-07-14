const router = require('express').Router();
const { z } = require('zod');
const SavedSearch = require('../models/SavedSearch');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.use(authenticate);

const savedSearchSchema = z.object({
    name: z.string().min(1).max(100),
    category: z.string().min(1),
    city: z.string().min(1),
    radiusMeters: z.number().min(500).max(50000).default(5000),
    providers: z.array(z.enum(['google_places', 'yelp', 'osm'])).default(['google_places']),
    schedule: z.string().nullable().optional(),
});

// GET /api/saved-searches
router.get('/', async (req, res, next) => {
    try {
        const searches = await SavedSearch.find({ owner: req.user._id }).sort({ createdAt: -1 });
        res.json({ searches });
    } catch (err) {
        next(err);
    }
});

// POST /api/saved-searches
router.post('/', validate(savedSearchSchema), async (req, res, next) => {
    try {
        const search = await SavedSearch.create({ ...req.validatedBody, owner: req.user._id });
        res.status(201).json({ search });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/saved-searches/:id
router.patch('/:id', async (req, res, next) => {
    try {
        const search = await SavedSearch.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $set: req.body },
            { new: true }
        );
        if (!search) return res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
        res.json({ search });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/saved-searches/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const search = await SavedSearch.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
        if (!search) return res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
        res.json({ message: 'Deleted' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
