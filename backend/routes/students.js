const express = require('express');
const router = express.Router();
const multer = require('multer');
const csvtojson = require('csvtojson');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const User = require('../models/User');

// Set up multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload CSVs in bulk (parallel processing)
router.post('/import', auth, upload.array('files'), async (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Unauthorized.' });
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded.' });
        }

        const filePromises = req.files.map(async (file) => {
            const csvString = file.buffer.toString('utf-8');
            const jsonArray = await csvtojson().fromString(csvString);

            const validStudents = [];
            const errors = [];

            jsonArray.forEach((row, index) => {
                if (row.name && row.email && row.grade && row.course) {
                    validStudents.push({
                        name: row.name,
                        email: row.email,
                        grade: row.grade,
                        course: row.course,
                        section: row.section || row.class || '',
                        phone: row.phone || '',
                        attendance: {
                            percentage: row.attendance != null && row.attendance !== '' ? Number(row.attendance) : 0,
                            records: []
                        },
                        uploadedBy: req.user.id
                    });
                } else {
                    errors.push(`Row ${index + 1} in file ${file.originalname} has missing fields.`);
                }
            });

            let insertedRaw = 0;
            for (let student of validStudents) {
                try {
                    await Student.updateOne(
                        { email: student.email },
                        { $set: student },
                        { upsert: true }
                    );
                    insertedRaw++;
                } catch (err) {
                    errors.push(`Error inserting row with email ${student.email}: ${err.message}`);
                }
            }

            return {
                fileName: file.originalname,
                processed: validStudents.length,
                insertedOrUpdated: insertedRaw,
                errors: errors
            };
        });

        const results = await Promise.all(filePromises);
        res.status(200).json({ message: 'Batch import completed', details: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during import.' });
    }
});

// Student: fetch MY OWN record (matched by User.email → Student.email)
router.get('/my-record', auth, async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can use this endpoint.' });
    }
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.email) {
            return res.status(404).json({ message: 'No email linked to your account. Please ask your instructor to update your profile.' });
        }
        const student = await Student.findOne({ email: new RegExp(`^${user.email}$`, 'i') });
        if (!student) return res.status(404).json({ message: 'No academic record found for your account. Please contact your instructor.' });
        res.json(student);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching your record.' });
    }
});

// Get class/section-wise grouped students (instructor only)
router.get('/classwise', auth, async (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Unauthorized.' });
    try {
        const classes = await Student.aggregate([
            {
                $group: {
                    _id: "$section",
                    count: { $sum: 1 },
                    students: { $push: { name: "$name", email: "$email", grade: "$grade", course: "$course" } }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        res.json(classes);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching class-wise data' });
    }
});

// Search and Read (CRUD - Read) — Instructor/Admin only
router.get('/', auth, async (req, res) => {
    if (req.user.role === 'student') {
        return res.status(403).json({ message: 'Access denied. Use /my-record to view your data.' });
    }
    try {
        const { search, course, grade, section } = req.query;
        const conditions = [];

        if (search) {
            conditions.push({
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { course: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { section: { $regex: search, $options: 'i' } }
                ]
            });
        }
        if (course) conditions.push({ course: { $regex: `^${course}$`, $options: 'i' } });
        if (grade) conditions.push({ grade: { $regex: `^${grade}$`, $options: 'i' } });
        if (section) conditions.push({ section: { $regex: `^${section}$`, $options: 'i' } });

        const query = conditions.length > 0 ? { $and: conditions } : {};
        const students = await Student.find(query).sort({ createdAt: -1 });
        res.json(students);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching students' });
    }
});

// Create single student
router.post('/', [
    auth,
    body('name', 'Name is required').not().isEmpty(),
    body('email', 'Please include a valid email').isEmail(),
    body('grade', 'Grade is required').not().isEmpty(),
    body('course', 'Course is required').not().isEmpty()
], async (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Unauthorized.' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
    }
    try {
        const { name, email, grade, course, section, phone, attendance } = req.body;
        const newStudent = new Student({
            name, email, grade, course,
            section: section || '',
            phone: phone || '',
            attendance: {
                percentage: attendance != null && attendance !== '' ? Number(attendance) : 0,
                records: []
            },
            uploadedBy: req.user.id
        });
        await newStudent.save();
        res.status(201).json(newStudent);
    } catch (err) {
        res.status(500).json({ message: 'Error creating student. Email might already exist.' });
    }
});

// Update student
router.put('/:id', auth, async (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Unauthorized.' });
    try {
        const { name, email, grade, course, section, phone, attendance } = req.body;
        const updates = {
            name, email, grade, course,
            section: section || '',
            phone: phone || ''
        };
        if (attendance !== undefined) {
            // If manual update from dashboard, we just update the percentage for simplicity in existing UI
            updates['attendance.percentage'] = attendance != null && attendance !== '' ? Number(attendance) : 0;
        }
        const student = await Student.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json(student);
    } catch (err) {
        res.status(500).json({ message: 'Error updating student' });
    }
});

// Delete student
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role === 'student') {
        return res.status(403).json({ message: 'Unauthorized. Students cannot delete records.' });
    }
    try {
        await Student.findByIdAndDelete(req.params.id);
        res.json({ message: 'Student deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting student' });
    }
});

// Mark Attendance (instructor only)
router.post('/attendance', auth, async (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Unauthorized.' });

    const { studentId, date, status, remark } = req.body;
    if (!studentId || !date || !status) {
        return res.status(400).json({ message: 'Please provide studentId, date, and status.' });
    }

    try {
        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ message: 'Student not found.' });

        // Check if attendance already exists for this date
        const markDate = new Date(date).setHours(0, 0, 0, 0);
        const existingIndex = student.attendance.records.findIndex(r =>
            new Date(r.date).setHours(0, 0, 0, 0) === markDate
        );

        if (existingIndex > -1) {
            student.attendance.records[existingIndex].status = status;
            student.attendance.records[existingIndex].remark = remark || '';
        } else {
            student.attendance.records.push({ date: markDate, status, remark: remark || '' });
        }

        // Calculate new percentage
        const presentCount = student.attendance.records.filter(r => r.status === 'present').length;
        student.attendance.percentage = Math.round((presentCount / student.attendance.records.length) * 100);

        await student.save();
        res.json({ message: 'Attendance marked', student });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error marking attendance.' });
    }
});

module.exports = router;
