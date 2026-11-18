require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { clerkMiddleware } = require('@clerk/express');
const { connectDB, requireDB } = require('./config/db');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const discoveryRoutes = require('./routes/discovery');
const savedSearchesRoutes = require('./routes/savedSearches');
const dashboardRoutes = require('./routes/dashboard');
const clerkWebhookRoutes = require('./routes/clerkWebhook');
const { runScheduledSearches } = require('./services/discovery/discoveryService');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── DB ───────────────────────────────────────────────────────────────────────
// Warm the connection on cold start, but never let a DB outage crash the
// function before CORS/error middleware can reply. `requireDB` gates each API
// route and returns a clear 503 instead.
connectDB().catch(() => {});

// Vercel terminates TLS at its proxy; trust one hop so rate limiting and IP
// logging see the real client address.
app.set('trust proxy', 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow every origin. Auth is stateless here: the Clerk token travels in the
// Authorization header, not as an ambient cookie. Reflecting the request origin
// (instead of "*") keeps credentialed requests working and guarantees browsers
// can always read success AND error responses, even from random preview URLs.
app.use(
    cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['RateLimit-Limit', 'RateLimit-Policy', 'RateLimit-Remaining', 'RateLimit-Reset'],
        maxAge: 86400,
    })
);

// Wait for MongoDB before any /api route (including the Clerk webhook).
app.use('/api', requireDB);

// ─── Clerk webhooks ──────────────────────────────────────────────────────────
// Must be mounted BEFORE express.json(): Svix signature verification needs the
// raw request body. The route is public; authenticity comes from the signature.
app.use('/api/webhooks/clerk', clerkWebhookRoutes);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const clerkConfigured = Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
if (clerkConfigured) {
    // Verifies Clerk session tokens and attaches req.auth
    app.use(clerkMiddleware());
} else {
    logger.warn(
        'Clerk is not configured — set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env. ' +
            'Authenticated routes will return 503 until then.'
    );
}

app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 500,
        standardHeaders: true,
        legacyHeaders: false,
    })
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
    res.json({ name: 'LeadScout API', version: '1.0.0', status: 'running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/saved-searches', savedSearchesRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404
app.use((_req, res) => {
    res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// Central error handler
app.use(errorHandler);

// ─── Cron (skip on Vercel serverless) ─────────────────────────────────────────
if (process.env.VERCEL !== '1') {
    cron.schedule('0 * * * *', () => {
        logger.info('Running scheduled discovery sweeps');
        runScheduledSearches();
    });
}

// ─── Server (skip on Vercel serverless) ───────────────────────────────────────
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'LeadScout API running');
    });
}

module.exports = app;
