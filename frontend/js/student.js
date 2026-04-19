const API_URL = 'http://localhost:5000/api';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

// Hide body — reveal only after server validates token
document.body.style.visibility = 'hidden';

if (!token || !role) {
    window.location.replace('/');
} else if (role !== 'student') {
    window.location.replace('/dashboard');
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchUserAndRecord();

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        window.location.replace('/');
    });
});

async function fetchUserAndRecord() {
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok) {
            // Update username display
            document.querySelector('#user-display span').textContent = data.username;
            document.body.style.visibility = 'visible';
            // Auto-load the student's own record
            fetchMyRecord();
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            window.location.replace('/');
        }
    } catch (err) {
        console.error('Auth check failed:', err);
        document.body.style.visibility = 'visible';
        showToast('Could not reach server. Please check your connection.', 'error');
    }
}

async function fetchMyRecord() {
    const spinner = document.getElementById('spinner-wrapper');
    const reportCard = document.getElementById('report-card');
    const notFound = document.getElementById('not-found');

    spinner.classList.remove('hidden');
    reportCard.classList.add('hidden');
    notFound.classList.add('hidden');

    try {
        const res = await fetch(`${API_URL}/students/my-record`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        spinner.classList.add('hidden');

        if (res.ok) {
            const student = await res.json();
            populateReportCard(student);
            reportCard.classList.remove('hidden');
        } else {
            const errData = await res.json();
            document.getElementById('not-found-msg').innerText =
                errData.message || 'No academic record found. Please contact your instructor.';
            notFound.classList.remove('hidden');
        }
    } catch (err) {
        spinner.classList.add('hidden');
        showToast('Network error while fetching your record.', 'error');
        notFound.classList.remove('hidden');
    }
}

function populateReportCard(student) {
    // Update hero name
    document.getElementById('hero-name').innerText = student.name.split(' ')[0];

    // Fill in fields
    document.getElementById('rc-name').innerText = student.name;
    document.getElementById('rc-email').innerText = student.email;
    document.getElementById('rc-section').innerText = student.section || 'N/A';
    document.getElementById('rc-phone').innerText = student.phone || 'N/A';
    document.getElementById('rc-course').innerText = student.course;
    document.getElementById('rc-grade').innerText = student.grade;

    // Grade badge color
    const gradeBadge = document.getElementById('rc-grade');
    const gradeVal = student.grade.toUpperCase();
    let gradeColor = 'var(--success)';
    if (gradeVal.startsWith('B')) gradeColor = '#0ea5e9';
    if (gradeVal.startsWith('C')) gradeColor = '#d29922';
    if (gradeVal.startsWith('D')) gradeColor = '#f97316';
    if (gradeVal.startsWith('F')) gradeColor = 'var(--danger)';
    gradeBadge.style.background = gradeColor;

    // Attendance bar
    const attendance = student.attendance;
    const pct = attendance && attendance.percentage !== undefined ? attendance.percentage : (typeof attendance === 'number' ? attendance : null);

    if (pct != null) {
        const displayPct = Math.min(100, Math.max(0, pct));
        document.getElementById('rc-attendance-text').innerText = `${displayPct}%`;
        const bar = document.getElementById('attendance-bar');
        setTimeout(() => { bar.style.width = `${displayPct}%`; }, 100);
        let barColor = '#22c55e';
        if (displayPct < 75) barColor = '#d29922';
        if (displayPct < 50) barColor = 'var(--danger)';
        bar.style.background = barColor;

        const attendanceText = document.getElementById('rc-attendance-text');
        attendanceText.style.color = barColor;

        // Display absent dates if any
        const absentDates = attendance.records ? attendance.records.filter(r => r.status === 'absent') : [];
        const absentSection = document.getElementById('absent-records-section');
        const absentList = document.getElementById('absent-list');

        if (absentDates.length > 0) {
            absentSection.classList.remove('hidden');
            absentList.innerHTML = '';
            absentDates.forEach(record => {
                const dateStr = new Date(record.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const span = document.createElement('span');
                span.style.cssText = `
                    background: rgba(248, 81, 73, 0.1);
                    color: #f85149;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    border: 1px solid rgba(248, 81, 73, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 5px;
                `;
                let content = `<i class="fas fa-calendar-day"></i> ${dateStr}`;
                if (record.remark) {
                    content += ` <span style="opacity:0.7; font-weight:400; font-size:0.75rem">(${record.remark})</span>`;
                }
                span.innerHTML = content;
                absentList.appendChild(span);
            });
        } else {
            absentSection.classList.add('hidden');
        }
    } else {
        document.getElementById('rc-attendance-text').innerText = 'Not recorded';
        document.getElementById('attendance-bar').style.width = '0%';
        document.getElementById('absent-records-section').classList.add('hidden');
    }
}

// UI Utilities
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerHTML = type === 'success'
        ? `<i class="fas fa-check-circle" style="color:var(--success)"></i> ${msg}`
        : `<i class="fas fa-exclamation-circle" style="color:var(--danger)"></i> ${msg}`;
    toast.className = `toast ${type} show`;
    setTimeout(() => { toast.className = 'toast hidden'; }, 3500);
}

// Theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            updateThemeIcon(next);
        });
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}
