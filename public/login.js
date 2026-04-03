function switchTab(tab) {
    document.getElementById('loginPanel').classList.toggle('active', tab === 'login');
    document.getElementById('signupPanel').classList.toggle('active', tab === 'signup');
    document.getElementById('loginTab').classList.toggle('active', tab === 'login');
    document.getElementById('signupTab').classList.toggle('active', tab === 'signup');
    showError('');
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait...' : btn.id === 'loginBtn' ? 'Log In' : 'Create Account';
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) { showError('Please enter your email and password.'); return; }

    setLoading('loginBtn', true);
    showError('');

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/';
        } else {
            showError(data.error || 'Login failed.');
        }
    } catch (err) {
        showError('Network error. Please try again.');
    } finally {
        setLoading('loginBtn', false);
    }
}

async function handleSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !password) { showError('Please fill in all fields.'); return; }
    if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }

    setLoading('signupBtn', true);
    showError('');

    try {
        const res = await fetch('/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/';
        } else {
            showError(data.error || 'Signup failed.');
        }
    } catch (err) {
        showError('Network error. Please try again.');
    } finally {
        setLoading('signupBtn', false);
    }
}

// Allow Enter key to submit
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const loginActive = document.getElementById('loginPanel').classList.contains('active');
        loginActive ? handleLogin() : handleSignup();
    }
});
