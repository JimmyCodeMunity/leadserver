require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { clerkMiddleware } = require('@clerk/express');
const connectDB = require('./config/db');
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
connectDB();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Parse comma-separated CLIENT_URL env var.
// Falls back to wildcard '*' only if no CLIENT_URL is set at all — this lets
// the server boot safely even before env vars are configured on Vercel, while
// still being locked down once CLIENT_URL is set.
const rawOrigins = process.env.CLIENT_URL || '';
const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // No origin = curl / Postman / server-to-server — allow
        if (!origin) return callback(null, true);
        // Wildcard fallback when CLIENT_URL is not set yet
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Don't throw — return null so Express sends a 403 not a 500
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// cors() also answers preflight OPTIONS requests
app.use(cors(corsOptions));

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
