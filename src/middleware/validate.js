const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ error: { message: messages, code: 'VALIDATION_ERROR' } });
    }
    req.validatedBody = result.data;
    next();
};

module.exports = { validate };
