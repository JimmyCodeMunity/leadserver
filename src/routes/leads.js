const router = require('express').Router();
const { z } = require('zod');
const Lead = require('../models/Lead');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.use(authenticate);

// GET /api/leads — list with filters
router.get('/', async (req, res, next) => {
    try {
        const {
            status,
            category,
            city,
            search,
            source,
            hasSocial,
            page = 1,
            limit = 50,
            sortBy = 'discoveredAt',
            sortDir = 'desc',
        } = req.query;

        const filter = { owner: req.user._id };

        if (status) filter.status = { $in: status.split(',') };
        if (category) filter.category = new RegExp(category, 'i');
        if (city) filter.address = new RegExp(city, 'i');
        if (source) filter.source = source;
        if (search) filter.businessName = new RegExp(search, 'i');
        if (hasSocial === 'true') {
            filter.$or = [
                { 'socialLinks.tiktok': { $ne: '' } },
                { 'socialLinks.instagram': { $ne: '' } },
                { 'socialLinks.facebook': { $ne: '' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortDir === 'asc' ? 1 : -1 };

        const [leads, total] = await Promise.all([
            Lead.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
            Lead.countDocuments(filter),
        ]);

        res.json({ leads, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        next(err);
    }
});

// GET /api/leads/export — CSV export
router.get('/export', async (req, res, next) => {
    try {
        const leads = await Lead.find({ owner: req.user._id }).lean();

        const headers = [
            'Business Name', 'Category', 'Phone', 'Address', 'Source',
            'Status', 'Has Website', 'TikTok', 'Instagram', 'Facebook',
            'Follow Up Date', 'Discovered At',
        ];

        const rows = leads.map((l) => [
            `"${(l.businessName || '').replace(/"/g, '""')}"`,
            `"${(l.category || '').replace(/"/g, '""')}"`,
            `"${(l.phone || '').replace(/"/g, '""')}"`,
            `"${(l.address || '').replace(/"/g, '""')}"`,
            l.source || '',
            l.status || '',
            l.hasWebsite ? 'Yes' : 'No',
            l.socialLinks?.tiktok || '',
            l.socialLinks?.instagram || '',
            l.socialLinks?.facebook || '',
            l.followUpDate ? new Date(l.followUpDate).toISOString().split('T')[0] : '',
            l.discoveredAt ? new Date(l.discoveredAt).toISOString().split('T')[0] : '',
        ]);

        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="leadscout-leads.csv"');
        res.send(csv);
    } catch (err) {
        next(err);
    }
});

// POST /api/leads/bulk-update
router.post('/bulk-update', async (req, res, next) => {
    try {
        const { ids, updates } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: { message: 'No IDs provided', code: 'VALIDATION_ERROR' } });
        }
        const allowed = ['status', 'followUpDate'];
        const safeUpdates = {};
        for (const key of allowed) {
            if (updates[key] !== undefined) safeUpdates[key] = updates[key];
        }
        const result = await Lead.updateMany(
            { _id: { $in: ids }, owner: req.user._id },
            { $set: safeUpdates }
        );
        res.json({ modifiedCount: result.modifiedCount });
    } catch (err) {
        next(err);
    }
});

// GET /api/leads/:id
router.get('/:id', async (req, res, next) => {
    try {
        const lead = await Lead.findOne({ _id: req.params.id, owner: req.user._id });
        if (!lead) return res.status(404).json({ error: { message: 'Lead not found', code: 'NOT_FOUND' } });
        res.json({ lead });
    } catch (err) {
        next(err);
    }
});

const updateLeadSchema = z.object({
    status: z.enum(['new', 'contacted', 'replied', 'negotiating', 'won', 'lost']).optional(),
    followUpDate: z.string().nullable().optional(),
    phone: z.string().optional(),
    socialLinks: z.object({
        tiktok: z.string().optional(),
        instagram: z.string().optional(),
        facebook: z.string().optional(),
        other: z.string().optional(),
    }).optional(),
}).strict();

// PATCH /api/leads/:id
router.patch('/:id', validate(updateLeadSchema), async (req, res, next) => {
    try {
        const lead = await Lead.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $set: req.validatedBody },
            { new: true }
        );
        if (!lead) return res.status(404).json({ error: { message: 'Lead not found', code: 'NOT_FOUND' } });
        res.json({ lead });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const lead = await Lead.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
        if (!lead) return res.status(404).json({ error: { message: 'Lead not found', code: 'NOT_FOUND' } });
        res.json({ message: 'Lead deleted' });
    } catch (err) {
        next(err);
    }
});

// POST /api/leads/:id/notes
router.post('/:id/notes', async (req, res, next) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: { message: 'Note text is required', code: 'VALIDATION_ERROR' } });
        }
        const lead = await Lead.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $push: { notes: { text: text.trim(), author: req.user.name } } },
            { new: true }
        );
        if (!lead) return res.status(404).json({ error: { message: 'Lead not found', code: 'NOT_FOUND' } });
        res.json({ lead });
    } catch (err) {
        next(err);
    }
});

// POST /api/leads/:id/outreach
router.post('/:id/outreach', async (req, res, next) => {
    try {
        const { channel, message, outcome } = req.body;
        if (!channel) {
            return res.status(400).json({ error: { message: 'Channel is required', code: 'VALIDATION_ERROR' } });
        }
        const lead = await Lead.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $push: { outreachLog: { channel, message, outcome, date: new Date() } } },
            { new: true }
        );
        if (!lead) return res.status(404).json({ error: { message: 'Lead not found', code: 'NOT_FOUND' } });
        res.json({ lead });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
