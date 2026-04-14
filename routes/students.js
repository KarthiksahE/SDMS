const express = require('express');
const router = express.Router();

let students = [
    { id: 1, name: "Karthik" },
    { id: 2, name: "Rahul" }
];

router.get('/', (req, res) => {
    res.json(students);
});

router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: "Name required" });
    }
    const newStudent = { id: students.length + 1, name };
    students.push(newStudent);
    res.status(201).json(newStudent);
});

module.exports = router;
