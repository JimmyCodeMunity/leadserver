const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    text: { type: String, required: true },
    author: { type: String, default: 'User' },
    createdAt: { type: Date, default: Date.now },
});

const outreachSchema = new mongoose.Schema({
    channel: {
        type: String,
        enum: ['tiktok_dm', 'instagram_dm', 'phone', 'email', 'facebook_dm', 'other'],
        required: true,
    },
    message: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    outcome: { type: String, default: '' },
});

const leadSchema = new mongoose.Schema(
    {
        businessName: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true },
        phone: { type: String, default: '' },
        address: { type: String, required: true, trim: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
        },
        socialLinks: {
            tiktok: { type: String, default: '' },
            instagram: { type: String, default: '' },
            facebook: { type: String, default: '' },
            other: { type: String, default: '' },
        },
        source: {
            type: String,
            enum: ['google_places', 'yelp', 'osm', 'manual'],
            required: true,
        },
        hasWebsite: { type: Boolean, default: false },
        websiteUrl: { type: String, default: '' },
        status: {
            type: String,
            enum: ['new', 'contacted', 'replied', 'negotiating', 'won', 'lost'],
            default: 'new',
        },
        notes: [noteSchema],
        outreachLog: [outreachSchema],
        followUpDate: { type: Date, default: null },
        discoveredAt: { type: Date, default: Date.now },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        externalId: { type: String, default: '' }, // provider-specific ID for dedup
        rating: { type: Number, default: null },
        reviewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Geospatial index
leadSchema.index({ location: '2dsphere' });
// Compound unique key for dedup (normalized name + address + owner)
leadSchema.index(
    { businessName: 1, address: 1, owner: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
);
// Fast dashboard queries
leadSchema.index({ status: 1, owner: 1 });
leadSchema.index({ owner: 1, discoveredAt: -1 });
leadSchema.index({ owner: 1, followUpDate: 1 });

module.exports = mongoose.model('Lead', leadSchema);
