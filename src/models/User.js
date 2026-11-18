const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        // Clerk's user id (e.g. user_2abc...). The unique sparse index lets
        // pre-Clerk users exist without one until they sign in with Clerk.
        clerkId: { type: String, unique: true, sparse: true },
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        // Legacy field from the old email/password auth. Not used anymore, but
        // kept so existing accounts can be linked by email instead of duplicated.
        passwordHash: { type: String, default: null },
        role: { type: String, enum: ['user', 'admin'], default: 'user' },
        avatar: { type: String, default: null },
    },
    { timestamps: true }
);

// Never return passwordHash in JSON
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
