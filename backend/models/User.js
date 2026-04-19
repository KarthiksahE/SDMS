const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['instructor', 'admin', 'student'], default: 'student' },
    email: { type: String, default: '' }  // used to link student accounts to their student records
});

module.exports = mongoose.model('User', userSchema);
