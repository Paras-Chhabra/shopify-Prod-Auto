document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoader = loginBtn.querySelector('.btn-loader');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = passwordInput.value.trim();
        if (!password) {
            errorMessage.textContent = 'Please enter a password';
            return;
        }

        // Set Loading State
        loginBtn.disabled = true;
        btnText.textContent = 'Authenticating...';
        btnLoader.classList.remove('hidden');
        errorMessage.textContent = '';

        try {
            const res = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await res.json();

            if (data.success) {
                // Success: Redirect to dashboard
                window.location.href = '/';
            } else {
                // Error: Show message
                errorMessage.textContent = data.error || 'Incorrect password';
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (err) {
            errorMessage.textContent = 'Connection error. Please try again.';
        } finally {
            // Reset Loading State
            loginBtn.disabled = false;
            btnText.textContent = 'Secure Login';
            btnLoader.classList.add('hidden');
        }
    });
});
