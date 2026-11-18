const express = require('express');
const User = require('../models/User');
const Lead = require('../models/Lead');
const SavedSearch = require('../models/SavedSearch');
const { linkOrCreateUser } = require('../services/userService');
const logger = require('../utils/logger');

const router = express.Router();

// svix v2 is ESM-only. A top-level require() crashes the whole Vercel function
// with ERR_REQUIRE_ESM, so load it lazily with dynamic import() instead.
let webhookClassPromise = null;

function loadWebhookClass() {
    if (!webhookClassPromise) {
        webhookClassPromise = import('svix').then((mod) => mod.Webhook);
    }
    return webhookClassPromise;
}

function primaryEmail(data) {
    return (
        data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ||
        data.email_addresses?.[0]?.email_address ||
        ''
    );
}

function displayName(data, email) {
    const full = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
    return full || data.username || (email ? email.split('@')[0] : '');
}

// POST /api/webhooks/clerk
// Mounted BEFORE express.json() in index.js so req.body is the raw payload.
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
        logger.error('CLERK_WEBHOOK_SIGNING_SECRET is not set — cannot verify Clerk webhooks');
        return res.status(503).json({
            error: { message: 'Webhook endpoint not configured', code: 'WEBHOOK_NOT_CONFIGURED' },
        });
    }

    let evt;
    try {
        const Webhook = await loadWebhookClass();
        const wh = new Webhook(signingSecret);
        evt = wh.verify(req.body, {
            'svix-id': req.headers['svix-id'],
            'svix-timestamp': req.headers['svix-timestamp'],
            'svix-signature': req.headers['svix-signature'],
        });
    } catch (err) {
        logger.warn({ err: err.message }, 'Clerk webhook signature verification failed');
        return res.status(400).json({
            error: { message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' },
        });
    }

    const { type, data } = evt;

    try {
        if (type === 'user.created' || type === 'user.updated') {
            const email = primaryEmail(data);
            const user = await linkOrCreateUser({
                clerkId: data.id,
                email,
                name: displayName(data, email),
                avatar: data.image_url,
            });
            logger.info({ type, clerkId: data.id, userId: user._id }, 'Synced Clerk user');
        } else if (type === 'user.deleted' && data.id) {
            const user = await User.findOne({ clerkId: data.id });
            if (user) {
                // Removing the owner would orphan these documents, so remove
                // the data they own as well. Sequential so the User document is
                // only deleted after its data is gone.
                await Lead.deleteMany({ owner: user._id });
                await SavedSearch.deleteMany({ owner: user._id });
                await User.deleteOne({ _id: user._id });
                logger.info(
                    { clerkId: data.id, userId: user._id },
                    'Deleted user and owned data after Clerk account deletion'
                );
            }
        }

        // Always 2xx for verified events, otherwise Clerk retries them.
        return res.json({ received: true });
    } catch (err) {
        logger.error({ err: err.message, type }, 'Clerk webhook handling failed');
        return res.status(500).json({
            error: { message: 'Webhook handling failed', code: 'WEBHOOK_ERROR' },
        });
    }
});

module.exports = router;
