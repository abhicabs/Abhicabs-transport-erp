import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import FormField from '../../components/ui/FormField';
import { APP_NAME } from '../../constants';
import { apiClient } from '../../services/apiClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email address'); return; }
    setLoading(true); setError('');
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      // Backend always returns 200 for security (no email enumeration)
      // but network/server errors can still happen
      setSent(true);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#F7F8FC' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ backgroundColor: '#111' }}>
            <img src="/brand/abhicabs-mark-dark.svg" alt={APP_NAME} style={{ height: 20, width: 20 }} />
          </div>
          <span className="font-bold" style={{ color: '#1F2937' }}>{APP_NAME}</span>
        </div>

        {sent ? (
          <div>
            <div style={{
              width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center',
              background: '#F0FDF4', marginBottom: 16,
            }}>
              <CheckCircle size={28} style={{ color: '#22A65A' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#1F2937' }}>Check your email</h1>
            <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
              If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              Check your inbox and spam folder.
            </p>
            <p className="text-sm mb-6" style={{ color: '#9CA3AF' }}>
              The link expires in 30 minutes.
            </p>
            <Link to="/admin/login"
              className="flex items-center gap-1.5 text-sm font-semibold hover:underline"
              style={{ color: '#3B65DB' }}>
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: '#1F2937' }}>Reset password</h1>
            <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
              Enter your email and we'll send you a reset link.
            </p>

            {error && <Alert type="error" className="mb-4">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Email address" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@abhicabs.in" autoFocus />
              </FormField>
              <Button type="submit" loading={loading} className="w-full" icon={Mail}>
                Send reset link
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