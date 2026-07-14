const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');

    if (err.code === 11000) {
        return res.status(409).json({
            error: { message: 'Duplicate entry — record already exists', code: 'DUPLICATE_ERROR' },
        });
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';

    res.status(status).json({
        error: { message, code: err.code || 'INTERNAL_ERROR' },
    });
};

module.exports = errorHandler;
