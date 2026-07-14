const router = require('express').Router();
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { validate } = require('../middleware/validate');
const {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    REFRESH_COOKIE_OPTIONS,
} = require('../utils/tokens');
const { authenticate } = require('../middleware/auth');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: { message: 'Too many attempts, please try again later', code: 'RATE_LIMITED' } },
    standardHeaders: true,
    legacyHeaders: false,
});

const signupSchema = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8).max(128),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

// POST /api/auth/signup
router.post('/signup', authLimiter, validate(signupSchema), async (req, res, next) => {
    try {
        const { name, email, password } = req.validatedBody;

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: { message: 'Email already registered', code: 'EMAIL_TAKEN' } });
        }

        const passwordHash = await User.hashPassword(password);
        const user = await User.create({ name, email, passwordHash });

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

        return res.status(201).json({ accessToken, user });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
    try {
        const { email, password } = req.validatedBody;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
        }

        const valid = await user.comparePassword(password);
        if (!valid) {
            return res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
        }

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

        return res.json({ accessToken, user });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
    try {
        const token = req.cookies.refreshToken;
        if (!token) {
            return res.status(401).json({ error: { message: 'No refresh token', code: 'UNAUTHORIZED' } });
        }

        const decoded = verifyRefreshToken(token);
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: { message: 'User not found', code: 'UNAUTHORIZED' } });
        }

        const accessToken = generateAccessToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);

        return res.json({ accessToken, user });
    } catch (err) {
        if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: { message: 'Invalid refresh token', code: 'UNAUTHORIZED' } });
        }
        next(err);
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('refreshToken', { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
    return res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// PATCH /api/auth/me
router.patch('/me', authenticate, async (req, res, next) => {
    try {
        const { name } = req.body;
        const updates = {};
        if (name) updates.name = name;

        if (req.body.password) {
            if (req.body.password.length < 8) {
                return res.status(400).json({ error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' } });
            }
            updates.passwordHash = await User.hashPassword(req.body.password);
        }

        const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
        res.json({ user });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
