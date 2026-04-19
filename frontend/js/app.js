const API_URL = 'http://localhost:5000/api';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

// Hide body immediately - revealed only after server confirms valid token
document.body.style.visibility = 'hidden';

// Only redirect unauthenticated users immediately.
// Invalid/expired tokens are caught by fetchUser() via server validation.
if (!token || !role) {
    window.location.replace('/');
}
// auth.js already server-validated the role before sending user here.


// Global Variables
let allStudents = [];
let debounceTimer;
let currentSort = { column: null, direction: 'asc' };
let currentPage = 1;
const rowsPerPage = 10;
let courseChartInstance = null;
let gradeChartInstance = null;

// DOM Elements
const studentTableBody = document.getElementById('student-table-body');
const searchInput = document.getElementById('search-input');
const spinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const studentForm = document.getElementById('student-form');
const logoutBtn = document.getElementById('logout-btn');

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchUser();
    fetchStudents();

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentPage = 1;
                fetchStudents(e.target.value);
            }, 300);
        });
    }

    const courseFilter = document.getElementById('filter-course');
    const gradeFilter = document.getElementById('filter-grade');

    if (courseFilter) courseFilter.addEventListener('change', () => fetchStudents(searchInput?.value || ''));
    if (gradeFilter) gradeFilter.addEventListener('change', () => fetchStudents(searchInput?.value || ''));

    const sectionFilter = document.getElementById('filter-section');
    if (sectionFilter) sectionFilter.addEventListener('change', () => fetchStudents(searchInput?.value || ''));

    if (studentForm) {
        studentForm.addEventListener('submit', handleStudentSubmit);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            window.location.replace('/');
        });
    }

    setupDragAndDrop();
});

// APIs
async function fetchUser() {
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            document.querySelector('#user-display span').textContent = data.username;
            // Server confirmed token is valid — safe to reveal the page
            document.body.style.visibility = 'visible';
        } else {
            // Invalid / expired token
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            window.location.replace('/');
        }
    } catch (err) {
        // Network error — reveal page anyway so user isn't stuck on a blank screen
        console.error('Auth check failed (network):', err);
        document.body.style.visibility = 'visible';
    }
}

async function fetchStudents(searchQuery = '') {
    showSpinner();
    try {
        const courseFilter = document.getElementById('filter-course')?.value || '';
        const gradeFilter = document.getElementById('filter-grade')?.value || '';
        const sectionFilter = document.getElementById('filter-section')?.value || '';

        let url = new URL(`${API_URL}/students`);
        if (searchQuery) url.searchParams.append('search', searchQuery);
        if (courseFilter) url.searchParams.append('course', courseFilter);
        if (gradeFilter) url.searchParams.append('grade', gradeFilter);
        if (sectionFilter) url.searchParams.append('section', sectionFilter);

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            allStudents = data;
            populateFilterOptions();
            renderStudents();
        } else {
            showToast('Error fetching data', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Network error', 'error');
    }
    hideSpinner();
}

function populateFilterOptions() {
    const courseSelect = document.getElementById('filter-course');
    const gradeSelect = document.getElementById('filter-grade');
    const sectionSelect = document.getElementById('filter-section');

    if (!courseSelect || !gradeSelect) return;

    const currentCourse = courseSelect.value;
    const currentGrade = gradeSelect.value;
    const currentSection = sectionSelect?.value || '';

    const courses = [...new Set(allStudents.map(s => s.course))].sort();
    const grades = [...new Set(allStudents.map(s => s.grade))].sort();
    const sections = [...new Set(allStudents.map(s => s.section).filter(Boolean))].sort();

    // Rebuild Course Dropdown
    courseSelect.innerHTML = '<option value="">All Courses</option>';
    courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = c;
        courseSelect.appendChild(opt);
    });

    // Rebuild Grade Dropdown
    gradeSelect.innerHTML = '<option value="">All Grades</option>';
    grades.forEach(g => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = g;
        gradeSelect.appendChild(opt);
    });

    // Rebuild Section Dropdown
    if (sectionSelect) {
        sectionSelect.innerHTML = '<option value="">All Sections</option>';
        sections.forEach(s => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = s;
            sectionSelect.appendChild(opt);
        });
    }

    // Restore selections
    if (currentCourse && [...courseSelect.options].some(o => o.value === currentCourse)) courseSelect.value = currentCourse;
    if (currentGrade && [...gradeSelect.options].some(o => o.value === currentGrade)) gradeSelect.value = currentGrade;
    if (currentSection && sectionSelect && [...sectionSelect.options].some(o => o.value === currentSection)) sectionSelect.value = currentSection;
}

// Render Table
function renderStudents() {
    studentTableBody.innerHTML = '';

    // Calculate Stats
    const totalEl = document.getElementById('stat-total-students');
    const coursesEl = document.getElementById('stat-courses');
    const gradesEl = document.getElementById('stat-top-grades');

    if (totalEl) totalEl.innerText = allStudents.length;

    if (coursesEl) {
        const uniqueCourses = new Set(allStudents.map(s => s.course.toLowerCase()));
        coursesEl.innerText = uniqueCourses.size;
    }

    if (gradesEl) {
        // Counting Grades containing A or A+
        const topGradesCount = allStudents.filter(s => s.grade.toUpperCase().includes('A')).length;
        gradesEl.innerText = topGradesCount;
    }

    if (allStudents.length === 0) {
        emptyState.classList.remove('hidden');
        document.getElementById('students-table').classList.add('hidden');
        document.getElementById('pagination').classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        document.getElementById('students-table').classList.remove('hidden');

        // Pagination calc
        const totalPages = Math.ceil(allStudents.length / rowsPerPage);
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const paginatedStudents = allStudents.slice(startIndex, endIndex);

        paginatedStudents.forEach(student => {
            const tr = document.createElement('tr');
            const attendanceValue = student.attendance ? (student.attendance.percentage !== undefined ? student.attendance.percentage : student.attendance) : null;
            const attendancePct = attendanceValue != null ? `${attendanceValue}%` : '—';
            const attendanceColor = attendanceValue == null ? 'var(--text-muted)'
                : attendanceValue >= 75 ? 'var(--success)'
                    : attendanceValue >= 50 ? '#d29922' : 'var(--danger)';
            tr.innerHTML = `
                <td><strong>${student.name}</strong></td>
                <td>${student.email}</td>
                <td><span style="background:var(--input-bg); padding:4px 8px; border-radius:12px; font-size:0.8rem">${student.section || '—'}</span></td>
                <td><span style="background:var(--input-bg); padding:4px 8px; border-radius:12px; font-size:0.8rem">${student.grade}</span></td>
                <td>${student.course}</td>
                <td style="color:${attendanceColor}; font-weight:600">${attendancePct}</td>
                <td class="action-icons">
                    <button class="icon-btn" title="Mark Attendance" onclick="openAttendanceModal('${student._id}')" style="color:var(--primary)"><i class="fas fa-calendar-check"></i></button>
                    <button class="icon-btn edit" title="Edit Student" onclick="editStudent('${student._id}')"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn delete" title="Delete Student" onclick="deleteStudent('${student._id}')"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            studentTableBody.appendChild(tr);
        });

        renderPagination(totalPages);
        updateCharts();
    }
}

function renderPagination(totalPages) {
    const paginationEl = document.getElementById('pagination');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (!paginationEl) return;

    if (allStudents.length <= rowsPerPage) {
        paginationEl.classList.add('hidden');
    } else {
        paginationEl.classList.remove('hidden');
        pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    }
}

function changePage(delta) {
    const totalPages = Math.ceil(allStudents.length / rowsPerPage);
    currentPage += delta;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    renderStudents();
}

// Sorting
function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // Update icons visually
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(h => {
        const icon = h.querySelector('i');
        icon.className = 'fas fa-sort'; // reset all
    });

    const clickIndex = ['name', 'email', 'grade', 'course'].indexOf(column);
    if (clickIndex !== -1 && headers[clickIndex]) {
        const icon = headers[clickIndex].querySelector('i');
        icon.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }

    allStudents.sort((a, b) => {
        let valA = (a[column] || '').toLowerCase();
        let valB = (b[column] || '').toLowerCase();

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderStudents();
}

// Export to CSV
function exportToCSV() {
    if (allStudents.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const headers = ['Name', 'Email', 'Section', 'Grade', 'Course', 'Phone', 'Attendance'];
    const csvRows = [headers.join(',')];

    allStudents.forEach(student => {
        const row = [
            `"${(student.name || '').replace(/"/g, '""')}"`,
            `"${(student.email || '').replace(/"/g, '""')}"`,
            `"${(student.section || '').replace(/"/g, '""')}"`,
            `"${(student.grade || '').replace(/"/g, '""')}"`,
            `"${(student.course || '').replace(/"/g, '""')}"`,
            `"${(student.phone || '').replace(/"/g, '""')}"`,
            student.attendance ? (student.attendance.percentage !== undefined ? student.attendance.percentage : student.attendance) : ''
        ];
        csvRows.push(row.join(','));
    });

    const csvData = csvRows.join('\n');
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'sdms_students_export.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Export successful!', 'success');
}

// Export to PDF
function exportToPDF() {
    if (allStudents.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text('Student Data Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

    const tableColumn = ["Name", "Email", "Grade", "Course"];
    const tableRows = [];

    allStudents.forEach(student => {
        const studentData = [
            student.name,
            student.email,
            student.grade,
            student.course
        ];
        tableRows.push(studentData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 28,
        theme: 'striped',
        headStyles: { fillColor: [9, 105, 218] }
    });

    doc.save('sdms_students_export.pdf');
    showToast('PDF Export successful!', 'success');
}

// Create & Update
async function handleStudentSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('student-id').value;
    const name = document.getElementById('student-name').value;
    const email = document.getElementById('student-email').value;
    const grade = document.getElementById('student-grade').value;
    const course = document.getElementById('student-course').value;
    const section = document.getElementById('student-section')?.value || '';
    const phone = document.getElementById('student-phone')?.value || '';
    const attendance = document.getElementById('student-attendance')?.value;
    const errorDiv = document.getElementById('student-form-error');

    errorDiv.innerText = '';
    const payload = {
        name, email, grade, course, section, phone,
        attendance: attendance !== '' && attendance != null ? Number(attendance) : 0
    };

    try {
        let url = `${API_URL}/students`;
        let method = 'POST';

        if (id) {
            url = `${url}/${id}`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            showToast(id ? 'Student updated!' : 'Student created!', 'success');
            closeModal('student-modal');
            fetchStudents(searchInput.value); // Refresh
        } else {
            errorDiv.innerText = data.message || 'Operation failed';
        }
    } catch (err) {
        errorDiv.innerText = 'Network error';
    }
}

function editStudent(id) {
    const student = allStudents.find(s => s._id === id);
    if (!student) return;

    document.getElementById('modal-title').innerText = 'Edit Student';
    document.getElementById('student-id').value = student._id;
    document.getElementById('student-name').value = student.name;
    document.getElementById('student-email').value = student.email;
    document.getElementById('student-grade').value = student.grade;
    document.getElementById('student-course').value = student.course;
    if (document.getElementById('student-section')) document.getElementById('student-section').value = student.section || '';
    if (document.getElementById('student-phone')) document.getElementById('student-phone').value = student.phone || '';

    const attendanceValue = student.attendance ? (student.attendance.percentage !== undefined ? student.attendance.percentage : student.attendance) : '';
    if (document.getElementById('student-attendance')) document.getElementById('student-attendance').value = attendanceValue;

    document.getElementById('student-form-error').innerText = '';
    openModal('student-modal', 'edit');
}

// Delete
async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) return;

    try {
        const res = await fetch(`${API_URL}/students/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            showToast('Student deleted', 'success');
            fetchStudents(searchInput.value);
        } else {
            showToast('Error deleting student', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
}

// Attendance Marking logic
function openAttendanceModal(id) {
    const student = allStudents.find(s => s._id === id);
    if (!student) return;

    document.getElementById('attendance-student-id').value = student._id;
    document.getElementById('attendance-student-info').innerHTML = `Marking for: <strong>${student.name}</strong> (${student.section || 'No Section'})`;

    // Set default date to today (local time)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendance-date').value = today;
    if (document.getElementById('attendance-remark')) document.getElementById('attendance-remark').value = '';
    document.getElementById('attendance-error').innerText = '';

    openModal('attendance-modal');
}

async function submitAttendance(status) {
    const studentId = document.getElementById('attendance-student-id').value;
    const date = document.getElementById('attendance-date').value;
    const remark = document.getElementById('attendance-remark')?.value || '';
    const errorDiv = document.getElementById('attendance-error');

    if (!date) {
        errorDiv.innerText = 'Please select a date.';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/students/attendance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ studentId, date, status, remark })
        });

        const data = await res.json();
        if (res.ok) {
            showToast(`Attendance marked as ${status}!`, 'success');
            closeModal('attendance-modal');
            fetchStudents(searchInput.value);
        } else {
            errorDiv.innerText = data.message || 'Failed to mark attendance';
        }
    } catch (err) {
        errorDiv.innerText = 'Network error';
    }
}

// CSV BATCH IMPORT
let selectedFiles = [];

function setupDragAndDrop() {
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const startBtn = document.getElementById('start-import-btn');

    if (!dropzone) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    startBtn.addEventListener('click', startBatchImport);
}

function handleFiles(files) {
    const dt = new DataTransfer();

    // Add old files
    selectedFiles.forEach(file => dt.items.add(file));

    // Validate and add new files
    Array.from(files).forEach(file => {
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            // check for duplicates
            if (!selectedFiles.find(f => f.name === file.name)) {
                dt.items.add(file);
                selectedFiles.push(file);
            }
        } else {
            showToast(`${file.name} is not a valid CSV file`, 'error');
        }
    });

    // Update input files
    document.getElementById('csv-file-input').files = dt.files;
    updateSelectedFilesList();
}

function removeFile(filename) {
    selectedFiles = selectedFiles.filter(f => f.name !== filename);
    const dt = new DataTransfer();
    selectedFiles.forEach(f => dt.items.add(f));
    document.getElementById('csv-file-input').files = dt.files;
    updateSelectedFilesList();
}

function updateSelectedFilesList() {
    const list = document.getElementById('selected-files-list');
    const startBtn = document.getElementById('start-import-btn');
    const resContainer = document.getElementById('import-results');
    resContainer.classList.add('hidden'); // hide past results

    list.innerHTML = '';

    if (selectedFiles.length === 0) {
        startBtn.disabled = true;
        return;
    }

    startBtn.disabled = false;

    selectedFiles.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <span><i class="fas fa-file-csv" style="color:var(--primary)"></i> ${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
            <span class="remove-file" onclick="removeFile('${file.name}')"><i class="fas fa-times"></i></span>
        `;
        list.appendChild(div);
    });
}

async function startBatchImport() {
    const startBtn = document.getElementById('start-import-btn');
    const progressContainer = document.getElementById('import-progress');
    const progressBar = document.getElementById('import-progress-bar');
    const resContainer = document.getElementById('import-results');

    if (selectedFiles.length === 0) return;

    startBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    resContainer.classList.add('hidden');
    progressBar.style.width = '30%'; // Fake initial progress

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        progressBar.style.width = '70%'; // Intermediate progress

        const res = await fetch(`${API_URL}/students/import`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await res.json();
        progressBar.style.width = '100%';

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            startBtn.disabled = false;

            resContainer.classList.remove('hidden');
            resContainer.innerHTML = '';

            if (res.ok) {
                showToast('Batch import completed!', 'success');
                // Display results breakdown
                let html = `<strong>Import Details:</strong><br/>`;
                data.details.forEach(res => {
                    html += `File: ${res.fileName} | Processed: ${res.processed} | Inserted/Updated: ${res.insertedOrUpdated}<br>`;
                    if (res.errors && res.errors.length > 0) {
                        res.errors.forEach(e => {
                            html += `<span class="err-msg">- ${e}</span><br>`;
                        });
                    }
                });
                resContainer.innerHTML = html;

                // Clear selected files
                selectedFiles = [];
                updateSelectedFilesList();
                fetchStudents(searchInput.value); // Refresh table
            } else {
                showToast('Import failed', 'error');
                resContainer.innerHTML = `<span class="err-msg">${data.message || 'Unknown error'}</span>`;
            }
        }, 500);

    } catch (err) {
        console.error(err);
        progressContainer.classList.add('hidden');
        startBtn.disabled = false;
        showToast('Network error during import', 'error');
    }
}


// UI Utilities
function openModal(id, mode = 'add') {
    if (id === 'student-modal') {
        if (mode === 'add') {
            // Always reset form cleanly when opening for a new student
            document.getElementById('student-form').reset();
            document.getElementById('student-id').value = '';
            document.getElementById('modal-title').innerText = 'Add Student';
            document.getElementById('student-form-error').innerText = '';
        }
        // When mode === 'edit', editStudent() has already populated the fields
    }
    if (id === 'import-modal') {
        selectedFiles = [];
        updateSelectedFilesList();
        document.getElementById('import-progress').classList.add('hidden');
        document.getElementById('import-results').classList.add('hidden');
    }
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    // Reset modal title so next open() call starts clean
    if (id === 'student-modal') {
        document.getElementById('modal-title').innerText = 'Add Student';
    }
}

function showSpinner() {
    spinner.classList.remove('hidden');
    document.getElementById('students-table').classList.add('hidden');
    emptyState.classList.add('hidden');
}

function hideSpinner() {
    spinner.classList.add('hidden');
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerHTML = type === 'success'
        ? `<i class="fas fa-check-circle" style="color:var(--success)"></i> ${msg}`
        : `<i class="fas fa-exclamation-circle" style="color:var(--danger)"></i> ${msg}`;

    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.className = 'toast hidden';
    }, 3000);
}

// THEME TOGGLE
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
            updateCharts(); // Redraw charts with new colors
        });
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// CHARTS INITIALIZATION
function updateCharts() {
    const ctxCourse = document.getElementById('courseChart');
    const ctxGrade = document.getElementById('gradeChart');
    if (!ctxCourse || !ctxGrade || allStudents.length === 0) return;

    const coursesCount = {};
    const gradesCount = {};

    allStudents.forEach(s => {
        coursesCount[s.course] = (coursesCount[s.course] || 0) + 1;
        gradesCount[s.grade] = (gradesCount[s.grade] || 0) + 1;
    });

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDarkMode ? '#c9d1d9' : '#24292f';
    const gridColor = isDarkMode ? '#30363d' : '#d0d7de';

    Chart.defaults.color = textColor;
    Chart.defaults.scale.grid.color = gridColor;

    // Course Chart (Bar)
    if (courseChartInstance) courseChartInstance.destroy();
    courseChartInstance = new Chart(ctxCourse, {
        type: 'bar',
        data: {
            labels: Object.keys(coursesCount),
            datasets: [{
                label: 'Enrolled Students',
                data: Object.values(coursesCount),
                backgroundColor: 'rgba(88, 166, 255, 0.6)',
                borderColor: 'rgb(88, 166, 255)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    // Grade Chart (Doughnut)
    if (gradeChartInstance) gradeChartInstance.destroy();
    gradeChartInstance = new Chart(ctxGrade, {
        type: 'doughnut',
        data: {
            labels: Object.keys(gradesCount),
            datasets: [{
                data: Object.values(gradesCount),
                backgroundColor: [
                    '#2ea043', '#58a6ff', '#f85149', '#d29922', '#8957e5', '#ec6547', '#ff57a2'
                ],
                borderWidth: 1,
                borderColor: isDarkMode ? '#161b22' : '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}
