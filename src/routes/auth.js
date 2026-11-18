const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const updateProfileSchema = z.object({
    name: z.string().min(2).max(80).optional(),
}).strict();

// GET /api/auth/me — local User document linked to the Clerk session
router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// PATCH /api/auth/me — update locally-stored profile fields.
// Email/password/avatar are managed by Clerk now.
router.patch('/me', authenticate, validate(updateProfileSchema), async (req, res, next) => {
    try {
        if (req.validatedBody.name) {
            req.user.name = req.validatedBody.name;
            await req.user.save();
        }
        res.json({ user: req.user });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
