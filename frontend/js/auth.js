const API_URL = 'http://localhost:5000/api';

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active-form');
        form.classList.add('hidden-form');
    });

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.remove('hidden-form');
    document.getElementById(`${tab}-form`).classList.add('active-form');
}

document.addEventListener('DOMContentLoaded', async () => {
    const existingToken = localStorage.getItem('token');
    const existingRole = localStorage.getItem('role');

    // If a token exists, VALIDATE it with the server before redirecting.
    // Never redirect based on localStorage alone — this was causing the redirect loop.
    if (existingToken && existingRole) {
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${existingToken}` }
            });
            if (res.ok) {
                // Token is genuinely valid — safe to redirect to the right portal
                if (existingRole === 'student') {
                    window.location.replace('/student-dashboard');
                } else {
                    window.location.replace('/dashboard');
                }
                return; // Stop here — navigation is underway
            } else {
                // Token is invalid/expired — clear it and stay on login page
                localStorage.removeItem('token');
                localStorage.removeItem('role');
            }
        } catch (err) {
            // Server unreachable — clear stale token and stay on login page
            console.warn('Could not validate existing session:', err.message);
            localStorage.removeItem('token');
            localStorage.removeItem('role');
        }
    }

    // Set up login/register form handlers
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            loginError.innerText = '';

            try {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('role', data.role);
                    if (data.role === 'student') {
                        window.location.replace('/student-dashboard');
                    } else {
                        window.location.replace('/dashboard');
                    }
                } else {
                    loginError.innerText = data.message || data.errors?.[0]?.msg || 'Login failed';
                }
            } catch (err) {
                loginError.innerText = 'Server error. Try again later.';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value;
            const password = document.getElementById('reg-password').value;
            const role = document.getElementById('reg-role')?.value || 'student';
            const email = document.getElementById('reg-email')?.value || '';
            registerError.innerText = '';

            try {
                const res = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, role, email })
                });
                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('role', data.role);
                    if (data.role === 'student') {
                        window.location.replace('/student-dashboard');
                    } else {
                        window.location.replace('/dashboard');
                    }
                } else {
                    registerError.innerText = data.message || data.errors?.[0]?.msg || 'Registration failed';
                }
            } catch (err) {
                registerError.innerText = 'Server error. Try again later.';
            }
        });
    }
});
