import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useForm } from '../../hooks/useForm';
import { required, isEmail } from '../../utils/validators';
import FormField     from '../../components/ui/FormField';
import Input         from '../../components/ui/Input';
import PasswordInput from '../../components/ui/PasswordInput';
import Button        from '../../components/ui/Button';
import Alert         from '../../components/ui/Alert';
import { APP_NAME } from '../../constants';

export default function AdminLogin() {
  const { loginAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { values, errors, touched, submitting, submitError, setValue, setFieldTouched, handleSubmit } =
    useForm({
      initialValues: { email: '', password: '' },
      schema: {
        email:    [required('Email'), isEmail],
        password: [required('Password')],
      },
      onSubmit: async (vals) => {
        await loginAdmin(vals);
        navigate(location.state?.from?.pathname || '/admin/dashboard', { replace: true });
      },
    });

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ backgroundColor: '#FAFAFA' }}>

      {/* ── Brand panel ── */}
      <div
        className="hidden lg:flex flex-col relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #1a1a1a 0%, #0a0a0a 50%, #111 100%)',
        }}
      >
        {/* Gold accent line at top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #FFC107, #F59E0B, #FFC107)',
        }} />

        {/* Decorative gold gradient orb */}
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-5%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,193,7,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Top — logo */}
        <div className="p-10 relative z-10">
          <img
            src="/brand/abhi-cabs-logo-footer.png"
            alt={`${APP_NAME} — Ride With Trust`}
            style={{ height: 56 }}
          />
        </div>

        {/* Centre — hero */}
        <div className="flex-1 flex items-center px-10 relative z-10">
          <div style={{ maxWidth: 480 }}>
            <h1 className="text-[44px] font-extrabold leading-[1.08] text-white mb-6"
                style={{ letterSpacing: '-1.5px' }}>
              Manage your fleet<br />
              <span style={{ color: '#FFC107' }}>with confidence.</span>
            </h1>
            <p className="text-[15px] leading-relaxed mb-12" style={{ color: '#777', maxWidth: 380 }}>
              Dispatch, live tracking, driver management, payments and reporting — all in one place.
            </p>

            {/* Stats */}
            <div className="flex gap-10">
              {[
                ['300+', 'Vehicles'],
                ['8', 'Cities'],
                ['24/7', 'Support'],
              ].map(([value, label]) => (
                <div key={label} style={{
                  padding: '16px 0',
                  borderTop: '2px solid rgba(255,193,7,0.3)',
                  minWidth: 80,
                }}>
                  <p className="text-[28px] font-extrabold text-white" style={{ letterSpacing: '-1px' }}>{value}</p>
                  <p className="text-[11px] mt-1 font-semibold tracking-wide uppercase" style={{ color: '#666' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="p-10 relative z-10">
          <p className="text-[11px]" style={{ color: '#444' }}>
            © 2026 {APP_NAME} · Ride With Trust
          </p>
        </div>
      </div>

      {/* ── Login form ── */}
      <div className="flex items-center justify-center p-8" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="w-full" style={{ maxWidth: 380 }}>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <img
              src="/brand/abhi-cabs-logo-new.svg"
              alt={`${APP_NAME} — Ride With Trust`}
              style={{ height: 44 }}
            />
          </div>

          {/* Card */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            padding: '36px 32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
          }}>
            <h1 className="text-[22px] font-extrabold tracking-tight mb-1"
                style={{ color: '#111', letterSpacing: '-0.5px' }}>
              Welcome back
            </h1>
            <p className="text-[13px] mb-7" style={{ color: '#999' }}>
              Sign in to the {APP_NAME} admin console.
            </p>

            {submitError && <Alert type="error" className="mb-5">{submitError}</Alert>}

            <div className="space-y-4">
              <FormField label="Email address" htmlFor="email" required error={touched.email && errors.email}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@abhicabs.in"
                  value={values.email}
                  onChange={(e) => setValue('email', e.target.value)}
                  onBlur={() => setFieldTouched('email')}
                />
              </FormField>

              <FormField label="Password" htmlFor="password" required error={touched.password && errors.password}>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={values.password}
                  onChange={(e) => setValue('password', e.target.value)}
                  onBlur={() => setFieldTouched('password')}
                />
              </FormField>

              <div className="flex justify-end">
                <Link
                  to="/admin/forgot"
                  className="text-[12px] font-semibold hover:underline focus-ring rounded"
                  style={{ color: '#B8860B' }}
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="button"
                className="w-full"
                loading={submitting}
                onClick={handleSubmit}
                style={{
                  backgroundColor: '#FFC107',
                  color: '#111',
                  fontWeight: 800,
                  fontSize: 15,
                  padding: '13px 0',
                  borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(255,193,7,0.3)',
                }}
              >
                Sign in
              </Button>
            </div>
          </div>

          <p className="text-center mt-6 text-[11px]" style={{ color: '#CCC' }}>
            Protected by 256-bit encryption
          </p>
        </div>
      </div>
    </div>
  );
}
