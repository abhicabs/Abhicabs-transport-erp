import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import FormField from '../../components/ui/FormField';
import { APP_NAME } from '../../constants';
import { apiClient } from '../../services/apiClient';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Verify token on mount
  useEffect(() => {
    if (!token) { setVerifying(false); return; }
    apiClient.post('/auth/reset-password/verify', { token })
      .then(() => setTokenValid(true))
      .catch(() => setTokenValid(false))
      .finally(() => setVerifying(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[a-z]/.test(password)) { setError('Include at least one lowercase letter'); return; }
    if (!/[A-Z]/.test(password)) { setError('Include at least one uppercase letter'); return; }
    if (!/[0-9]/.test(password)) { setError('Include at least one number'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F7F8FC' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <img src="/brand/abhi-cabs-logo-new.svg" alt={APP_NAME} style={{ height: 44 }} />
        </div>

        {verifying ? (
          <p style={{ color: '#6B7280' }}>Verifying reset link…</p>
        ) : !token || !tokenValid ? (
          <div>
            <div style={{
              width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center',
              background: '#FEF2F2', marginBottom: 16,
            }}>
              <AlertTriangle size={28} style={{ color: '#DC2626' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#1F2937' }}>
              {!token ? 'No reset token' : 'Link expired'}
            </h1>
            <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
              {!token
                ? 'This page requires a password reset link. Request one from the forgot password page.'
                : 'This reset link has expired or already been used. Request a new one.'}
            </p>
            <Link to="/admin/forgot" className="flex items-center gap-1.5 text-sm font-semibold hover:underline" style={{ color: '#3B65DB' }}>
              Request new reset link
            </Link>
          </div>
        ) : done ? (
          <div>
            <div style={{
              width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center',
              background: '#F0FDF4', marginBottom: 16,
            }}>
              <CheckCircle size={28} style={{ color: '#22A65A' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#1F2937' }}>Password reset!</h1>
            <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Button onClick={() => navigate('/admin/login')} className="w-full">
              Sign in
            </Button>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: '#1F2937' }}>Set new password</h1>
            <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
              Choose a strong password with at least 8 characters, one uppercase, one lowercase, and one number.
            </p>

            {error && <Alert type="error" className="mb-4">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="New password" required>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters" autoFocus />
              </FormField>
              <FormField label="Confirm password" required>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Type password again" />
              </FormField>
              <Button type="submit" loading={loading} className="w-full" icon={Lock}>
                Reset password
              </Button>
            </form>

            <Link to="/admin/login"
              className="flex items-center gap-1.5 text-sm font-semibold mt-6 hover:underline"
              style={{ color: '#3B65DB' }}>
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
