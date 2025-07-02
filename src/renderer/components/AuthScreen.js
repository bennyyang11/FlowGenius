const { ipcRenderer } = require('electron');
const React = require('react');

// Authentication Screen Component
function AuthScreen({ onAuthSuccess }) {
  const [authMode, setAuthMode] = React.useState('signin'); // 'signin', 'signup', 'forgot'
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [formData, setFormData] = React.useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: ''
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (authMode === 'signup') {
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        const result = await ipcRenderer.invoke('auth-sign-up', {
          email: formData.email,
          password: formData.password,
          displayName: formData.displayName
        });

        if (result.success) {
          setSuccess(result.message);
          setTimeout(() => onAuthSuccess(result.user), 1500);
        } else {
          setError(result.message);
        }
      } else if (authMode === 'signin') {
        const result = await ipcRenderer.invoke('auth-sign-in', {
          email: formData.email,
          password: formData.password
        });

        if (result.success) {
          setSuccess(result.message);
          setTimeout(() => onAuthSuccess(result.user), 1000);
        } else {
          setError(result.message);
        }
      } else if (authMode === 'forgot') {
        const result = await ipcRenderer.invoke('auth-reset-password', formData.email);

        if (result.success) {
          setSuccess(result.message);
          setTimeout(() => setAuthMode('signin'), 2000);
        } else {
          setError(result.message);
        }
      }
    } catch (error) {
      setError('An unexpected error occurred');
      console.error('Auth error:', error);
    }

    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await ipcRenderer.invoke('auth-sign-in-google');

      if (result.success) {
        setSuccess(result.message);
        setTimeout(() => onAuthSuccess(result.user), 1000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Google sign-in failed');
      console.error('Google auth error:', error);
    }

    setLoading(false);
  };

  return React.createElement('div', { className: 'auth-screen' },
    React.createElement('div', { className: 'auth-container' },
      // Header
      React.createElement('div', { className: 'auth-header' },
        React.createElement('div', { className: 'auth-logo' },
          React.createElement('span', { className: 'auth-logo-icon' }, '🔮'),
          React.createElement('h1', { className: 'auth-logo-text' }, 'FlowGenius')
        ),
        React.createElement('p', { className: 'auth-subtitle' }, 
          authMode === 'signin' ? 'Welcome back! Sign in to continue organizing your files with AI.' :
          authMode === 'signup' ? 'Create your account to start using AI-powered file management.' :
          'Enter your email to reset your password.'
        )
      ),

      // Error/Success Messages
      error && React.createElement('div', { className: 'auth-message error' }, error),
      success && React.createElement('div', { className: 'auth-message success' }, success),

      // Auth Form
      React.createElement('form', { className: 'auth-form', onSubmit: handleSubmit },
        // Display Name (Signup only)
        authMode === 'signup' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Full Name'),
          React.createElement('input', {
            type: 'text',
            className: 'form-input',
            placeholder: 'Enter your full name',
            value: formData.displayName,
            onChange: (e) => handleInputChange('displayName', e.target.value),
            required: authMode === 'signup'
          })
        ),

        // Email
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Email'),
          React.createElement('input', {
            type: 'email',
            className: 'form-input',
            placeholder: 'Enter your email',
            value: formData.email,
            onChange: (e) => handleInputChange('email', e.target.value),
            required: true
          })
        ),

        // Password (not for forgot password)
        authMode !== 'forgot' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Password'),
          React.createElement('input', {
            type: 'password',
            className: 'form-input',
            placeholder: 'Enter your password',
            value: formData.password,
            onChange: (e) => handleInputChange('password', e.target.value),
            required: authMode !== 'forgot'
          })
        ),

        // Confirm Password (Signup only)
        authMode === 'signup' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Confirm Password'),
          React.createElement('input', {
            type: 'password',
            className: 'form-input',
            placeholder: 'Confirm your password',
            value: formData.confirmPassword,
            onChange: (e) => handleInputChange('confirmPassword', e.target.value),
            required: authMode === 'signup'
          })
        ),

        // Submit Button
        React.createElement('button', {
          type: 'submit',
          className: `auth-submit-btn ${loading ? 'loading' : ''}`,
          disabled: loading
        },
          loading ? 'Please wait...' :
          authMode === 'signin' ? 'Sign In' :
          authMode === 'signup' ? 'Create Account' :
          'Send Reset Email'
        )
      ),

      // Google Sign In (not for forgot password)
      authMode !== 'forgot' && React.createElement('div', { className: 'auth-divider' },
        React.createElement('span', null, 'or')
      ),

      authMode !== 'forgot' && React.createElement('button', {
        type: 'button',
        className: 'google-signin-btn',
        onClick: handleGoogleSignIn,
        disabled: loading
      },
        React.createElement('span', { className: 'google-icon' }, '🔍'),
        'Continue with Google'
      ),

      // Auth Mode Switch
      React.createElement('div', { className: 'auth-switch' },
        authMode === 'signin' && React.createElement(React.Fragment, null,
          React.createElement('span', null, "Don't have an account? "),
          React.createElement('button', {
            type: 'button',
            className: 'auth-link',
            onClick: () => setAuthMode('signup')
          }, 'Sign Up'),
          React.createElement('span', null, ' | '),
          React.createElement('button', {
            type: 'button',
            className: 'auth-link',
            onClick: () => setAuthMode('forgot')
          }, 'Forgot Password?')
        ),

        authMode === 'signup' && React.createElement(React.Fragment, null,
          React.createElement('span', null, 'Already have an account? '),
          React.createElement('button', {
            type: 'button',
            className: 'auth-link',
            onClick: () => setAuthMode('signin')
          }, 'Sign In')
        ),

        authMode === 'forgot' && React.createElement(React.Fragment, null,
          React.createElement('span', null, 'Remember your password? '),
          React.createElement('button', {
            type: 'button',
            className: 'auth-link',
            onClick: () => setAuthMode('signin')
          }, 'Sign In')
        )
      )
    )
  );
}

module.exports = { AuthScreen }; 