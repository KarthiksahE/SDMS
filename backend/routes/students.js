const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const csvtojson = require('csvtojson');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const User = require('../models/User');

// Set up multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

function normalizeAttendance(attendance) {
    if (attendance == null) {
        return { percentage: 0, records: [] };
    }

    if (typeof attendance === 'number') {
        const percentage = Math.max(0, Math.min(100, Number(attendance) || 0));
        return { percentage, records: [] };
    }

    const parsedPercentage = Number(attendance.percentage);
    const percentage = Number.isFinite(parsedPercentage)
        ? Math.max(0, Math.min(100, parsedPercentage))
        : 0;

    return {
        percentage,
        records: Array.isArray(attendance.records) ? attendance.records : []
    };
}

function normalizeStudentDoc(studentDoc) {
    if (!studentDoc) return studentDoc;

    return {
        ...studentDoc,
        attendance: normalizeAttendance(studentDoc.attendance)
    };
}

function isAdmin(user) {
    return user && user.role === 'admin';
}

function getInstructorScope(user) {
    if (!user || isAdmin(user)) return {};

    const ownerIds = [String(user.id)];
    if (mongoose.Types.ObjectId.isValid(user.id)) {
        ownerIds.push(new mongoose.Types.ObjectId(user.id));
    }

    return { uploadedBy: { $in: ownerIds } };
}

router.post('/import', auth, upload.array('files'), async (req, res) => {

    if (!req.user || req.user.role === 'student') {
        return res.status(403).json({ message: 'Unauthorized.' });
    }

    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded.' });
        }

        const results = [];

        for (const file of req.files) {

            const csvString = file.buffer.toString('utf-8');
            const jsonArray = await csvtojson().fromString(csvString);

            const validStudents = [];
            const errors = [];

            for (let index = 0; index < jsonArray.length; index++) {
                const row = jsonArray[index];

                if (row.name && row.email && row.grade && row.course) {

                    const email = row.email.toLowerCase().trim();
                    const parsedAttendance = Number(row.attendance);

                    validStudents.push({
                        name: row.name.trim(),
                        email,
                        grade: row.grade,
                        course: row.course,
                        section: row.section || row.class || '',
                        phone: row.phone || '',
                        attendance: {
                            percentage: !isNaN(parsedAttendance) ? parsedAttendance : 0,
                            records: []
                        },
                        uploadedBy: req.user.id
                    });

                } else {
                    errors.push(`Row ${index + 1} missing required fields`);
                }
            }

            const operations = validStudents.map(student => ({
                updateOne: {
                    filter: { email: student.email },
                    update: { $set: student },
                    upsert: true
                }
            }));

            const result = await Student.bulkWrite(operations);

            results.push({
                fileName: file.originalname,
                processed: validStudents.length,
                insertedOrUpdated: result.modifiedCount + result.upsertedCount,
                errors
            });
        }

        res.status(200).json({ message: 'Batch import completed', details: results });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// Student: fetch MY OWN record (matched by User.email → Student.email)
router.get('/my-record', auth, async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ message: 'Only students can use this endpoint.' });
    }
    try {
        const user = await User.findById(req.user.id).lean();
        if (!user || !user.email) {
            return res.status(404).json({ message: 'No email linked to your account. Please ask your instructor to update your profile.' });
        }

        const escapedEmail = user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const student = await Student.collection.findOne({
            email: { $regex: `^${escapedEmail}$`, $options: 'i' }
        });

        if (!student) {
            return res.status(404).json({ message: 'No academic record found for your account. Please contact your instructor.' });
        }

        res.json(normalizeStudentDoc(student));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching your record.' });
    }
});

// Get class/section-wise grouped students (instructor only)
router.get('/classwise', auth, async (req, res) => {
    if (req.user.role === 'student') return res.status(403).json({ message: 'Unauthorized.' });
    try {
        const scope = getInstructorScope(req.user);
        const classes = await Student.aggregate([
            ...(Object.keys(scope).length ? [{ $match: scope }] : []),
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

    if (!req.user || req.user.role === 'student') {
        return res.status(403).json({
            message: 'Access denied. Use /my-record to view your data.'
        });
    }

    try {
        const { search, course, grade, section, page, limit } = req.query;

        const escapeRegex = (text) =>
            text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const conditions = [];

        if (search) {
            const safeSearch = escapeRegex(search);
            conditions.push({
                $or: [
                    { name: { $regex: safeSearch, $options: 'i' } },
                    { course: { $regex: safeSearch, $options: 'i' } },
                    { email: { $regex: safeSearch, $options: 'i' } },
                    { section: { $regex: safeSearch, $options: 'i' } }
                ]
            });
        }

        if (course) conditions.push({ course });
        if (grade) conditions.push({ grade });
        if (section) conditions.push({ section });

        const scope = getInstructorScope(req.user);
        if (Object.keys(scope).length) conditions.push(scope);

        const query = conditions.length ? { $and: conditions } : {};

        let studentsCursor = Student.find(query)
            .select('-__v')
            .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
            .lean();

        // Apply pagination only when client explicitly requests it.
        const pageNum = Number(page);
        const limitNum = Number(limit);
        if (Number.isInteger(pageNum) && pageNum > 0 && Number.isInteger(limitNum) && limitNum > 0) {
            studentsCursor = studentsCursor
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum);
        }

        const students = await studentsCursor;

        res.json(students.map(normalizeStudentDoc));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
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
        const scope = getInstructorScope(req.user);
        const filter = { _id: req.params.id, ...scope };
        const student = await Student.findOneAndUpdate(filter, updates, { new: true });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
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
        const scope = getInstructorScope(req.user);
        const filter = { _id: req.params.id, ...scope };
        const result = await Student.findOneAndDelete(filter);
        if (!result) {
            return res.status(404).json({ message: 'Student not found.' });
        }
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
        const scope = getInstructorScope(req.user);
        const filter = { _id: studentId, ...scope };
        const student = await Student.findOne(filter);
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
