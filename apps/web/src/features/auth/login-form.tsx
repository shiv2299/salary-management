'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiSend } from '@/lib/api';
import { sessionSchema } from './use-session';

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiSend('POST', '/api/auth/login', sessionSchema, credentials),
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
      router.replace('/insights');
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const emailValue = form.get('email');
    const passwordValue = form.get('password');
    const email = typeof emailValue === 'string' ? emailValue.trim() : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';
    const next = {
      email: email ? undefined : 'Enter your email',
      password: password ? undefined : 'Enter your password',
    };
    setErrors(next);
    if (next.email || next.password) return;
    login.mutate({ email, password });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-negative">
            {errors.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password && (
          <p id="password-error" className="text-xs text-negative">
            {errors.password}
          </p>
        )}
      </div>
      {login.error && (
        <p role="alert" className="text-sm text-negative">
          {login.error.message}
        </p>
      )}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  );
}
