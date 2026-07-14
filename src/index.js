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

// Middleware
app.use(
    cors({
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/saved-searches', savedSearchesRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// Central error handler
app.use(errorHandler);

// Schedule: run saved searches every hour (individual cron per search handled in service)
cron.schedule('0 * * * *', () => {
    logger.info('Running scheduled discovery sweeps');
    runScheduledSearches();
});

app.listen(PORT, () => {
    logger.info(`LeadScout API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app; // for testing
