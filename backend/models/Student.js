const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    grade: { type: String, required: true },
    course: { type: String, required: true },
    section: { type: String, default: '' },       // Class/Section e.g. "10A", "11B"
    phone: { type: String, default: '' },          // Contact number
    attendance: {
        percentage: { type: Number, default: 0, min: 0, max: 100 },
        records: [{
            date: { type: Date, required: true },
            status: { type: String, enum: ['present', 'absent'], required: true },
            remark: { type: String, default: '' }
        }]
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
