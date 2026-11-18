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
// Origins come from CLIENT_URL / CLIENT_URLS / FRONTEND_URL (comma-separated).
// Wildcards are supported, e.g. https://leadscout-*.vercel.app.
// Vercel preview deployments are allowed by default because Clerk auth travels
// in the Authorization header (not ambient cookies); set
// ALLOW_VERCEL_PREVIEWS=false to lock this down to explicit origins.
const LOCAL_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];

// Keep the known production frontend working even if a Vercel env var is
// missing or still points at an older custom domain.
const BUILT_IN_ORIGINS = [...LOCAL_ORIGINS, 'https://clientleadscout.vercel.app'];

const readOriginList = (...values) =>
    values
        .flatMap((value) => (value || '').split(','))
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean);

const allowedOrigins = [
    ...new Set([
        ...BUILT_IN_ORIGINS,
        ...readOriginList(process.env.CLIENT_URL, process.env.CLIENT_URLS, process.env.FRONTEND_URL),
    ]),
];

const wildcardMatchers = allowedOrigins
    .filter((origin) => origin.includes('*'))
    .map((origin) => new RegExp(`^${origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i'));

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== 'false';

const isVercelOrigin = (origin) => {
    try {
        const { protocol, hostname } = new URL(origin);
        return protocol === 'https:' && (hostname === 'vercel.app' || hostname.endsWith('.vercel.app'));
    } catch {
        return false;
    }
};

const isAllowedOrigin = (origin) => {
    if (allowedOrigins.includes(origin)) return true;
    if (wildcardMatchers.some((matcher) => matcher.test(origin))) return true;
    if (allowVercelPreviews && isVercelOrigin(origin)) return true;
    return false;
};

const corsOptions = {
    origin: (origin, callback) => {
        // No origin = curl / Postman / server-to-server — allow.
        if (!origin) return callback(null, true);
        if (isAllowedOrigin(origin)) return callback(null, true);

        // Never throw here: a thrown CORS error becomes a 500 without CORS
        // headers, which is exactly the opaque browser failure we want to avoid.
        logger.warn({ origin }, 'CORS origin rejected — add it to CLIENT_URL on Vercel');
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
};

// cors() also answers preflight OPTIONS requests.
app.use(cors(corsOptions));

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
