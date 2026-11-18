const { getAuth, clerkClient } = require('@clerk/express');
const User = require('../models/User');
const { linkOrCreateUser } = require('../services/userService');
const logger = require('../utils/logger');

function isClerkConfigured() {
    return Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function primaryEmail(clerkUser) {
    return (
        clerkUser.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
        clerkUser.emailAddresses?.[0]?.emailAddress ||
        ''
    );
}

function displayName(clerkUser, email) {
    const full = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim();
    return full || clerkUser.username || (email ? email.split('@')[0] : '');
}

/**
 * Verifies the Clerk session and attaches the matching local Mongo user
 * to req.user. Creates/links the local user on first sight.
 */
const authenticate = async (req, res, next) => {
    try {
        if (!isClerkConfigured()) {
            return res.status(503).json({
                error: { message: 'Authentication is not configured', code: 'AUTH_NOT_CONFIGURED' },
            });
        }

        const { isAuthenticated, userId } = getAuth(req);
        if (!isAuthenticated || !userId) {
            const authorization = req.headers.authorization || '';
            const sentToken = authorization.startsWith('Bearer ');
            const clerkReason = res.getHeader('x-clerk-auth-reason') || null;
            const clerkStatus = res.getHeader('x-clerk-auth-status') || null;

            let claims = null;
            if (sentToken) {
                try {
                    claims = JSON.parse(
                        Buffer.from(authorization.slice(7).split('.')[1], 'base64url').toString('utf8')
                    );
                } catch {
                    claims = null;
                }
            }

            logger.warn(
                {
                    sentToken,
                    clerkReason,
                    clerkStatus,
                    claims: claims
                        ? {
                              iss: claims.iss,
                              azp: claims.azp,
                              sub: claims.sub,
                              exp: claims.exp,
                              now: Math.floor(Date.now() / 1000),
                          }
                        : null,
                },
                'Clerk authentication failed'
            );

            return res.status(401).json({
                error: sentToken
                    ? {
                          message: 'Clerk rejected the session token. Sign out and sign in again.',
                          code: 'INVALID_TOKEN',
                      }
                    : {
                          message: 'No Clerk session token was sent. Sign out and sign in again.',
                          code: 'NO_TOKEN',
                      },
            });
        }

        // Normal path: user was already synced (by this middleware or webhook)
        let user = await User.findOne({ clerkId: userId });

        // First request for this Clerk user — pull the profile and upsert.
        // This also covers setups where the webhook is not configured yet.
        if (!user) {
            const clerkUser = await clerkClient.users.getUser(userId);
            const email = primaryEmail(clerkUser);
            user = await linkOrCreateUser({
                clerkId: userId,
                email,
                name: displayName(clerkUser, email),
                avatar: clerkUser.imageUrl,
            });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.status === 400) {
            logger.warn({ err: err.message }, 'Could not sync Clerk user');
            return res.status(401).json({ error: { message: err.message, code: 'UNAUTHORIZED' } });
        }
        next(err);
    }
};

module.exports = { authenticate };
