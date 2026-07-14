const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        radiusMeters: { type: Number, required: true, default: 5000 },
        providers: {
            type: [String],
            enum: ['google_places', 'yelp', 'osm'],
            default: ['google_places'],
        },
        schedule: { type: String, default: null }, // cron string, null = manual only
        isPaused: { type: Boolean, default: false },
        lastRunAt: { type: Date, default: null },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

savedSearchSchema.index({ owner: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
