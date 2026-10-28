'use client';

import { MAX_AMOUNT_MINOR, type NewEmployeeBody } from '@acme/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { amountLimitMessage, parseMajorToMinor } from '@/lib/money';
import { useCountries, useDepartments, useLevels } from '@/features/reference/use-reference';
import { useCreateEmployee } from './use-employee';

interface Props {
  today: string;
  /** Called with the new employee's id once it has been created. */
  onCreated: (id: number) => void;
}

type FieldName =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'country'
  | 'department'
  | 'level'
  | 'jobTitle'
  | 'hireDate'
  | 'amount';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmployeeForm({ today, onCreated }: Props) {
  const countries = useCountries().data ?? [];
  const departments = useDepartments().data ?? [];
  const levels = useLevels().data ?? [];
  const create = useCreateEmployee();
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState('');
  const currencyCode = countries.find((country) => country.code === countryCode)?.currencyCode;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };

    const next: Partial<Record<FieldName, string>> = {};
    if (!text('firstName')) next.firstName = 'Enter a first name';
    if (!text('lastName')) next.lastName = 'Enter a last name';
    if (!EMAIL_PATTERN.test(text('email'))) next.email = 'Enter a valid email address';
    if (!countryCode) next.country = 'Country is required';
    if (!text('department')) next.department = 'Department is required';
    if (!text('level')) next.level = 'Level is required';
    if (!text('jobTitle')) next.jobTitle = 'Enter a job title';
    const hireDate = text('hireDate');
    if (!hireDate || hireDate > today) next.hireDate = 'The hire date cannot be in the future';
    const amountMinor = currencyCode ? parseMajorToMinor(text('amount'), currencyCode) : null;
    if (!text('amount')) next.amount = 'Enter the starting annual salary';
    else if (currencyCode && (amountMinor === null || amountMinor <= 0)) {
      next.amount = 'Enter an amount like 1234.50';
    } else if (currencyCode && amountMinor !== null && amountMinor > MAX_AMOUNT_MINOR) {
      next.amount = amountLimitMessage(currencyCode);
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || amountMinor === null) return;

    const body: NewEmployeeBody = {
      firstName: text('firstName'),
      lastName: text('lastName'),
      email: text('email').toLowerCase(),
      countryCode,
      departmentId: Number(text('department')),
      levelId: Number(text('level')),
      jobTitle: text('jobTitle'),
      hireDate,
      amountMinor,
    };
    create.mutate(body, {
      onSuccess: (detail) => {
        toast.success(`${detail.firstName} ${detail.lastName} created`);
        onCreated(detail.id);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setErrors({ email: error.message });
        } else {
          setServerError(error.message);
        }
      },
    });
  }

  function error(name: FieldName) {
    const message = errors[name];
    return message ? (
      <p id={`ne-${name}-error`} className="text-xs text-negative">
        {message}
      </p>
    ) : null;
  }

  const invalid = (name: FieldName) => (errors[name] ? true : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-firstName">First name</Label>
          <Input id="ne-firstName" name="firstName" aria-invalid={invalid('firstName')} />
          {error('firstName')}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-lastName">Last name</Label>
          <Input id="ne-lastName" name="lastName" aria-invalid={invalid('lastName')} />
          {error('lastName')}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ne-email">Email</Label>
        <Input id="ne-email" name="email" type="email" aria-invalid={invalid('email')} />
        {error('email')}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-country">Country</Label>
          <Select
            id="ne-country"
            value={countryCode}
            aria-invalid={invalid('country')}
            onChange={(event) => {
              setCountryCode(event.target.value);
            }}
          >
            <option value="">Choose a country</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
          {error('country')}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-department">Department</Label>
          <Select
            id="ne-department"
            name="department"
            defaultValue=""
            aria-invalid={invalid('department')}
          >
            <option value="">Choose a department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
          {error('department')}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-level">Level</Label>
          <Select id="ne-level" name="level" defaultValue="" aria-invalid={invalid('level')}>
            <option value="">Choose a level</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.code} · {level.label}
              </option>
            ))}
          </Select>
          {error('level')}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-jobTitle">Job title</Label>
          <Input id="ne-jobTitle" name="jobTitle" aria-invalid={invalid('jobTitle')} />
          {error('jobTitle')}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-hireDate">Hire date</Label>
          <Input
            id="ne-hireDate"
            name="hireDate"
            type="date"
            max={today}
            defaultValue={today}
            aria-invalid={invalid('hireDate')}
          />
          {error('hireDate')}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ne-amount">Starting annual salary</Label>
          <div className="flex items-center gap-2">
            <Input
              id="ne-amount"
              name="amount"
              inputMode="decimal"
              aria-invalid={invalid('amount')}
              className="text-right tabular-nums"
            />
            <span className="text-sm text-text-secondary">{currencyCode ?? ''}</span>
          </div>
          {error('amount')}
        </div>
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-sm border border-negative/40 bg-negative/5 p-2 text-sm text-negative"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" className="self-start" disabled={create.isPending}>
        Create employee
      </Button>
    </form>
  );
}
