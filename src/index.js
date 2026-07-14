require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const discoveryRoutes = require('./routes/discovery');
const savedSearchesRoutes = require('./routes/savedSearches');
const dashboardRoutes = require('./routes/dashboard');
const { runScheduledSearches } = require('./services/discovery/discoveryService');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to DB
connectDB();

// Allow multiple frontend origins (comma-separated in CLIENT_URL)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (curl, Postman, server-to-server)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error(`CORS: origin ${origin} not allowed`));
        },
        credentials: true,
    })
);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Global rate limiter
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 500,
        standardHeaders: true,
        legacyHeaders: false,
    })
);

// Health / root check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
    res.json({ name: 'LeadScout API', version: '1.0.0', status: 'running' });
});

// API Routes — must come BEFORE the 404 handler
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/saved-searches', savedSearchesRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// Central error handler
app.use(errorHandler);

// Scheduled discovery sweeps — every hour
// Skipped on Vercel (serverless has no persistent process)
if (process.env.VERCEL !== '1') {
    cron.schedule('0 * * * *', () => {
        logger.info('Running scheduled discovery sweeps');
        runScheduledSearches();
    });
}

// Only bind a port when running directly (not on Vercel serverless)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        logger.info(`LeadScout API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
} else {
    logger.info('LeadScout API loaded as Vercel serverless function');
}

module.exports = app;
