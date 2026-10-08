import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field, Input } from '../components/ui';
import { APP_NAME } from '../config';
import { PyramidOutline } from '../components/BrandMark';
import { Logo } from '../layout/AppLayout';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ login: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.login, form.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      {/* Декоративная половина — «чертёж» */}
      <div className="relative hidden overflow-hidden bg-side text-side-ink lg:block">
        <svg className="absolute inset-0 h-full w-full opacity-[0.14]" aria-hidden>
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0v32" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <PyramidOutline className="absolute -bottom-36 -right-40 h-[500px] w-[500px] text-accent opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div className="max-w-md">
            <p className="font-display text-4xl font-semibold leading-[1.1] text-white">
              Расписание, задания и общение — в одном портале.
            </p>
            <p className="mt-5 text-side-ink/70">
              Нижегородский государственный архитектурно-строительный университет. Пары на неделю, сдача работ, оценки
              и чаты групп — для студентов и преподавателей.
            </p>
          </div>
          <p className="text-xs text-side-ink/50">© {new Date().getFullYear()} {APP_NAME}</p>
        </div>
      </div>

      <div className="paper-grid flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold">Вход в портал</h1>
          <p className="mt-2 text-sm text-muted">Используйте логин или email, выданный в деканате.</p>

          <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
            <Field label="Логин или email">
              <Input
                autoFocus
                autoComplete="username"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                required
              />
            </Field>
            <Field label="Пароль">
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <ErrorBox message={error} />}
            <Button type="submit" className="w-full" loading={loading} icon={<LogIn className="h-4 w-4" />}>
              Войти
            </Button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6 rounded border border-dashed border-line p-4 text-xs text-muted">
              <p className="mb-2 font-semibold text-ink">Тестовые учётные записи</p>
              <ul className="space-y-1 font-mono">
                <li>student / student123</li>
                <li>teacher / teacher123</li>
                <li>admin / admin123</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
