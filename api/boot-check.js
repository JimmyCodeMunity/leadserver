// Temporary boot diagnostic. Remove after the production startup issue is fixed.
// It is intentionally isolated from src/index.js so it can report an import
// failure that would otherwise take the whole API down.
try {
    require('dotenv').config();
} catch {
    // dotenv is optional in this isolated function
}

module.exports = async (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Cache-Control', 'no-store');

    const report = {
        node: process.version,
        platform: process.platform,
        vercel: process.env.VERCEL || null,
        nodeEnv: process.env.NODE_ENV || null,
        envPresent: {
            MONGODB_URI: Boolean(process.env.MONGODB_URI),
            CLERK_PUBLISHABLE_KEY: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
            CLERK_SECRET_KEY: Boolean(process.env.CLERK_SECRET_KEY),
            CLIENT_URL: Boolean(process.env.CLIENT_URL),
            CLERK_WEBHOOK_SIGNING_SECRET: Boolean(process.env.CLERK_WEBHOOK_SIGNING_SECRET),
        },
    };

    try {
        report.mongoose = require('mongoose/package.json').version;
    } catch (err) {
        report.mongooseError = err.message;
    }

    try {
        const { clerkMiddleware } = require('@clerk/express');
        clerkMiddleware();
        report.clerkMiddleware = 'ok';
    } catch (err) {
        report.clerkMiddlewareError = { message: err.message, stack: String(err.stack || '').split('\n').slice(0, 12) };
    }

    try {
        const app = require('../src/index.js');
        report.appLoaded = typeof app;
    } catch (err) {
        report.appError = {
            name: err.name,
            message: err.message,
            code: err.code,
            stack: String(err.stack || '').split('\n').slice(0, 15),
        };
    }

    res.status(200).json(report);
};
