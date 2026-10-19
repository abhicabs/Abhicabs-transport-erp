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
    <div className="min-h-screen grid lg:grid-cols-5" style={{ backgroundColor: '#FAFAFA' }}>

      {/* ── Brand panel — spans 3 of 5 cols ── */}
      <div
        className="hidden lg:flex flex-col col-span-3 relative overflow-hidden"
        style={{ backgroundColor: '#0A0A0A' }}
      >
        {/* Subtle radial glow behind the content */}
        <div style={{
          position: 'absolute', top: '20%', left: '30%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,193,7,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Top — logo */}
        <div className="p-10 relative z-10">
          <img
            src="/brand/abhi-cabs-logo-full.svg"
            alt={`${APP_NAME} — Ride With Trust`}
            style={{ height: 52 }}
          />
        </div>

        {/* Centre — hero message */}
        <div className="flex-1 flex items-center px-10 relative z-10">
          <div style={{ maxWidth: 520 }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-5"
               style={{ color: '#FFC107', letterSpacing: '0.2em' }}>
              Fleet Management Console
            </p>
            <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight text-white mb-5"
                style={{ letterSpacing: '-1.5px' }}>
              Everything your fleet needs. One&nbsp;dashboard.
            </h1>
            <p className="text-base leading-relaxed mb-10" style={{ color: '#888', maxWidth: 420 }}>
              Dispatch, live tracking, driver management, payments and reporting — built for the way you operate.
            </p>

            {/* Stats row */}
            <div className="flex gap-12">
              {[
                ['300+', 'Vehicles'],
                ['8', 'Cities'],
                ['24/7', 'Operations'],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="text-3xl font-extrabold tracking-tight" style={{ color: '#FFC107' }}>{value}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color: '#666' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom — footer */}
        <div className="p-10 relative z-10">
          <p className="text-xs" style={{ color: '#333' }}>
            © 2026 {APP_NAME} · Ride With Trust
          </p>
        </div>
      </div>

      {/* ── Login form — spans 2 of 5 cols ── */}
      <div className="col-span-2 flex items-center justify-center p-8">
        <div className="w-full" style={{ maxWidth: 380 }}>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <img
              src="/brand/abhi-cabs-logo-new.svg"
              alt={`${APP_NAME} — Ride With Trust`}
              style={{ height: 44 }}
            />
          </div>

          {/* Welcome text */}
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight mb-2"
                style={{ color: '#111', letterSpacing: '-0.5px' }}>
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: '#999' }}>
              Sign in to the {APP_NAME} admin console.
            </p>
          </div>

          {submitError && <Alert type="error" className="mb-5">{submitError}</Alert>}

          <div className="space-y-5">
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
                className="text-xs font-semibold hover:underline focus-ring rounded"
                style={{ color: '#b45309' }}
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
              }}
            >
              Sign in
            </Button>
          </div>

          {/* Security note */}
          <p className="text-center mt-8 text-xs" style={{ color: '#CCC' }}>
            Protected by 256-bit encryption
          </p>
        </div>
      </div>
    </div>
  );
}
