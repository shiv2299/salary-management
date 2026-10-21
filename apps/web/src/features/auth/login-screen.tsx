import { AppMark } from '@/components/ui/app-mark';
import { LoginForm } from './login-form';

const bars = [40, 70, 55, 100, 85, 130, 115, 170, 150, 210];

export function LoginScreen() {
  return (
    <main className="flex flex-1 flex-col md:flex-row">
      <aside
        aria-label="Salary Management"
        className="relative flex items-center overflow-hidden bg-brand-panel px-4 py-4 md:w-[55%] md:items-start md:p-10"
      >
        <AppMark tone="dark" />
        <svg
          aria-hidden="true"
          viewBox="0 0 400 220"
          className="absolute right-0 bottom-0 hidden w-2/3 max-w-[28rem] text-white opacity-10 md:block"
        >
          {bars.map((height, index) => (
            <rect
              key={index}
              x={index * 40 + 6}
              y={220 - height}
              width={28}
              height={height}
              rx={2}
              fill="currentColor"
            />
          ))}
        </svg>
      </aside>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-text-primary">Sign in</h1>
            <p className="text-sm text-text-secondary">Use your work email and password.</p>
          </div>
          <LoginForm />
          <p className="text-xs text-text-secondary">Sessions last a working day.</p>
        </div>
      </div>
    </main>
  );
}
