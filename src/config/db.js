const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Cache the connection attempt so concurrent serverless invocations share one
// handshake instead of opening a new pool per request.
let connectionPromise = null;

const isConnected = () => mongoose.connection.readyState === 1;

const connectDB = async () => {
    if (isConnected()) return mongoose.connection;
    if (connectionPromise) return connectionPromise;

    if (!process.env.MONGODB_URI) {
        const err = new Error('MONGODB_URI is not configured');
        err.code = 'DATABASE_NOT_CONFIGURED';
        logger.error(err.message);
        throw err;
    }

    connectionPromise = mongoose
        .connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
        })
        .then((conn) => {
            logger.info(`MongoDB connected: ${conn.connection.host}`);
            return conn.connection;
        })
        .catch((err) => {
            // Reset so the next request can retry after a cold-start hiccup.
            connectionPromise = null;
            logger.error({ err: err.message }, 'MongoDB connection failed');
            throw err;
        });

    return connectionPromise;
};

// If the connection drops after a successful handshake, allow a reconnect on
// the next request rather than serving against a dead pool.
mongoose.connection.on('disconnected', () => {
    connectionPromise = null;
    logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    logger.error({ err: err.message }, 'MongoDB connection error');
});

/**
 * Express middleware: wait for MongoDB before touching routes that need it.
 * A database outage becomes a clear, CORS-readable 503 instead of a crashed
 * function or an opaque 500.
 */
const requireDB = async (_req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(503).json({
            error: {
                message:
                    'Database unavailable. Check MONGODB_URI and make sure Atlas allows connections from your deployment.',
                code: err.code === 'DATABASE_NOT_CONFIGURED' ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_UNAVAILABLE',
            },
        });
    }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.requireDB = requireDB;
module.exports.isConnected = isConnected;
