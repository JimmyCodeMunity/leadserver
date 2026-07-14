const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: { message: 'No token provided', code: 'UNAUTHORIZED' } });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        const user = await User.findById(decoded.userId).select('-passwordHash');
        if (!user) {
            return res.status(401).json({ error: { message: 'User not found', code: 'UNAUTHORIZED' } });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: { message: 'Token expired', code: 'TOKEN_EXPIRED' } });
        }
        return res.status(401).json({ error: { message: 'Invalid token', code: 'UNAUTHORIZED' } });
    }
};

module.exports = { authenticate };
