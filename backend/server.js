const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
let mongoLastError = null;

function resolveMongoUri() {
    const candidates = [
        { key: 'MONGODB_URI', value: process.env.MONGODB_URI },
        { key: 'MONGODB_URL', value: process.env.MONGODB_URL },
        { key: 'MONGO_URI', value: process.env.MONGO_URI },
        // Azure App Service exposes custom connection strings as CUSTOMCONNSTR_<NAME>
        { key: 'CUSTOMCONNSTR_MONGODB_URI', value: process.env.CUSTOMCONNSTR_MONGODB_URI }
    ];

    const found = candidates.find((item) => typeof item.value === 'string' && item.value.trim());
    return {
        uri: found ? found.value.trim() : '',
        source: found ? found.key : null
    };
}

const mongoConfig = resolveMongoUri();

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
if (!mongoConfig.uri) {
    mongoLastError = 'MongoDB URI missing. Set MONGODB_URI (or MONGODB_URL / MONGO_URI / CUSTOMCONNSTR_MONGODB_URI).';
    console.log('MongoDB Error:', mongoLastError);
} else {
    mongoose.connect(mongoConfig.uri)
    .then(() => {
        mongoLastError = null;
        console.log('MongoDB Connected');
    })
    .catch(err => {
        mongoLastError = err.message;
        console.log('MongoDB Error:', err.message);
    });
}

mongoose.connection.on('error', (err) => {
    mongoLastError = err.message;
    console.log('MongoDB Connection Error:', err.message);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        mongoReadyState: mongoose.connection.readyState,
        mongoConnected: mongoose.connection.readyState === 1,
        mongoUriSource: mongoConfig.source,
        mongoLastError
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