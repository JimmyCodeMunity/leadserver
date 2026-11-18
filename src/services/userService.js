const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Link a Clerk account to a local User document, creating one if needed.
 *
 * - Users already linked by `clerkId` have their Clerk profile fields refreshed.
 * - Users created by the old email/password auth are matched by email and
 *   linked, so they keep their existing leads and saved searches.
 * - Everything else creates a new User row.
 *
 * @returns {Promise<import('mongoose').Document>} local User document
 */
async function linkOrCreateUser({ clerkId, email, name, avatar }) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!clerkId) {
        const err = new Error('Clerk user id is missing');
        err.status = 400;
        throw err;
    }
    if (!normalizedEmail) {
        const err = new Error('Clerk user has no email address');
        err.status = 400;
        throw err;
    }

    // 1. Already linked — keep Clerk profile fields in sync
    let user = await User.findOne({ clerkId });
    if (user) {
        const previousEmail = user.email;
        let changed = false;
        if (user.email !== normalizedEmail) {
            user.email = normalizedEmail;
            changed = true;
        }
        if (name && user.name !== name) {
            user.name = name;
            changed = true;
        }
        if (avatar && user.avatar !== avatar) {
            user.avatar = avatar;
            changed = true;
        }

        if (changed) {
            try {
                await user.save();
            } catch (err) {
                // Another local account may already own the new email — keep the
                // existing one rather than failing the whole request/webhook.
                if (err.code !== 11000) throw err;
                user.email = previousEmail;
                logger.warn(
                    { clerkId, userId: user._id },
                    'Skipped Clerk profile email sync: address already in use'
                );
            }
        }
        return user;
    }

    // 2. Existing pre-Clerk user — link by email instead of creating a duplicate
    user = await User.findOne({ email: normalizedEmail });
    if (user) {
        user.clerkId = clerkId;
        if (avatar) user.avatar = avatar;
        if (!user.name && name) user.name = name;
        try {
            await user.save();
        } catch (err) {
            if (err.code === 11000) {
                const linked = await User.findOne({ clerkId });
                if (linked) return linked;
            }
            throw err;
        }
        logger.info({ userId: user._id, clerkId }, 'Linked existing user to Clerk account');
        return user;
    }

    // 3. Brand new user
    try {
        user = await User.create({
            clerkId,
            email: normalizedEmail,
            name: name || normalizedEmail.split('@')[0],
            avatar: avatar || null,
        });
        logger.info({ userId: user._id, clerkId }, 'Created user from Clerk account');
        return user;
    } catch (err) {
        // Race with a concurrent request or webhook — return whichever won
        if (err.code === 11000) {
            const existing =
                (await User.findOne({ clerkId })) || (await User.findOne({ email: normalizedEmail }));
            if (existing) return existing;
        }
        throw err;
    }
}

module.exports = { linkOrCreateUser };
