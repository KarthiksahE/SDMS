const express = require('express');
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const router = express.Router();

function isAuthConfigValid() {
    return Boolean(process.env.JWT_SECRET);
}

function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[aby]?\$\d\d\$[./A-Za-z0-9]{53}$/.test(value);
}

function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

router.post('/register', [
    check('username', 'Please enter a valid username').not().isEmpty(),
    check('password', 'Please enter a valid password').isLength({ min: 6 })
], async (req, res) => {
    if (!isAuthConfigValid()) {
        return res.status(500).json({ message: 'Server auth configuration is missing.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, role, email } = req.body;
    try {
        let user = await User.findOne({ username });
        if (user) return res.status(400).json({ message: 'User already exists' });

        const assignedRole = (role === 'instructor' || role === 'student') ? role : 'student';

        user = new User({ username, password, role: assignedRole, email: email || '' });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id, role: user.role } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
            if (err) {
                console.error('JWT sign error (register):', err.message);
                return res.status(500).json({ message: 'Could not complete registration.' });
            }
            res.status(201).json({ token, role: user.role });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error in Saving');
    }
});

router.post('/login', [
    check('username', 'Please enter a valid username').not().isEmpty(),
    check('password', 'Please enter a valid password').isLength({ min: 6 })
], async (req, res) => {
    if (!isAuthConfigValid()) {
        return res.status(500).json({ message: 'Server auth configuration is missing.' });
    }

    if (!isMongoConnected()) {
        return res.status(503).json({ message: 'Database is not connected. Please try again in a moment.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    try {
        let user = await User.findOne({ username });
        if (!user) return res.status(400).json({ message: 'User Not Exist' });

        if (typeof user.password !== 'string' || !user.password.trim()) {
            return res.status(500).json({ message: 'User account is missing a password.' });
        }

        let isMatch = false;
        if (isBcryptHash(user.password)) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = password === user.password;

            // Migrate legacy plaintext passwords to bcrypt after a successful login.
            if (isMatch) {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(password, salt);
                await user.save();
            }
        }

        if (!isMatch) return res.status(400).json({ message: 'Incorrect Password !' });

        const payload = { user: { id: user.id, role: user.role } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
            if (err) {
                console.error('JWT sign error (login):', err.message);
                return res.status(500).json({ message: 'Could not complete login.' });
            }
            res.status(200).json({ token, role: user.role });
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server Error' });
    }
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (e) {
        res.status(500).json({ message: 'Error in Fetching user' });
    }
});

module.exports = router;
