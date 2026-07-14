const router = require('express').Router();
const Lead = require('../models/Lead');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', async (req, res, next) => {
    try {
        const ownerId = req.user._id;

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        const [
            totalLeads,
            newThisWeek,
            byStatus,
            byCategory,
            followUpsToday,
        ] = await Promise.all([
            Lead.countDocuments({ owner: ownerId }),
            Lead.countDocuments({ owner: ownerId, discoveredAt: { $gte: startOfWeek } }),
            Lead.aggregate([
                { $match: { owner: ownerId } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
            Lead.aggregate([
                { $match: { owner: ownerId } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 8 },
            ]),
            Lead.find({
                owner: ownerId,
                followUpDate: { $gte: todayStart, $lte: todayEnd },
            }).select('businessName category phone status followUpDate').lean(),
        ]);

        const statusMap = {};
        byStatus.forEach((s) => { statusMap[s._id] = s.count; });

        const inProgress = (statusMap.contacted || 0) + (statusMap.replied || 0) + (statusMap.negotiating || 0);

        res.json({
            totalLeads,
            newThisWeek,
            inProgress,
            won: statusMap.won || 0,
            byStatus: byStatus.map((s) => ({ name: s._id, value: s.count })),
            byCategory: byCategory.map((c) => ({ name: c._id, value: c.count })),
            followUpsToday,
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
