import { LoginForm } from '@/features/auth/login-form';

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-text-primary">Salary Management</h1>
          <p className="text-sm text-text-secondary">Sign in to continue.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
