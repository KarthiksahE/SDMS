const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later',
});
app.use('/api', apiLimiter);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB Error:', err.message));

mongoose.connection.on('error', (err) => {
    console.log('MongoDB Connection Error:', err.message);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        mongoReadyState: mongoose.connection.readyState,
        mongoConnected: mongoose.connection.readyState === 1
    });
});

// Resolve frontend location for both local dev and Azure deployment packages.
const frontendCandidates = [
    path.resolve(__dirname, 'public'),
    path.resolve(__dirname, '../frontend')
];

const frontendDir = frontendCandidates.find((dir) =>
    fs.existsSync(path.join(dir, 'index.html'))
);

const hasFrontendBuild = Boolean(frontendDir);

if (hasFrontendBuild) {
    app.use(express.static(frontendDir));

    app.get('/', (req, res) => {
        res.sendFile(path.join(frontendDir, 'index.html'));
    });

    app.get('/dashboard', (req, res) => {
        res.sendFile(path.join(frontendDir, 'dashboard.html'));
    });

    app.get('/student-dashboard', (req, res) => {
        res.sendFile(path.join(frontendDir, 'student-dashboard.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.status(200).json({
            message: 'API is running. Frontend files were not found in deployment package.'
        });
    });
}

// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});