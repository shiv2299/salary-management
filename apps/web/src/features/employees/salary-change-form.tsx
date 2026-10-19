'use client';

import type { EmployeeDetail, SalaryChangeBody } from '@acme/shared';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseMajorToMinor, toInputAmount } from '@/lib/money';
import {
  fetchConvertedAmount,
  useCountries,
  useFxAsOfDate,
  useLevels,
} from '@/features/reference/use-reference';
import { useSalaryChange } from './use-employee';

type Reason = SalaryChangeBody['reason'];

const REASONS: { value: Reason; label: string }[] = [
  { value: 'raise', label: 'Raise' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'relocation', label: 'Relocation' },
  { value: 'correction', label: 'Correction' },
];

interface Props {
  employee: EmployeeDetail;
  /** Today (UTC, yyyy-mm-dd), injected for deterministic tests. */
  today: string;
  onSaved?: () => void;
}

type Errors = Partial<Record<'amount' | 'level' | 'country' | 'date', string>>;

export function SalaryChangeForm({ employee, today, onSaved }: Props) {
  const countries = useCountries().data ?? [];
  const levels = useLevels().data ?? [];
  const fxDate = useFxAsOfDate();
  const mutation = useSalaryChange(employee.id);

  const [reason, setReason] = useState<Reason>('raise');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [amountText, setAmountText] = useState('');
  const [newLevelId, setNewLevelId] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');
  const [converted, setConverted] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const latestConversion = useRef(0);

  if (employee.status === 'inactive') {
    return (
      <p className="text-sm text-text-secondary">
        Reactivate this employee to record a salary change. Changes cannot be recorded for inactive
        employees.
      </p>
    );
  }

  const current = employee.salary;
  const currentLevel = levels.find((level) => level.id === employee.levelId);
  const higherLevels = levels.filter((level) => level.rank > (currentLevel?.rank ?? Infinity));
  const destinations = countries.filter((country) => country.code !== employee.countryCode);
  const destination = countries.find((country) => country.code === newCountryCode);
  const currencyCode =
    reason === 'relocation' && destination ? destination.currencyCode : current.currencyCode;

  function chooseReason(next: Reason) {
    setReason(next);
    setErrors({});
    setServerError(null);
    setAmountText('');
    setNewLevelId('');
    setNewCountryCode('');
    setConverted('idle');
  }

  async function chooseCountry(code: string) {
    setNewCountryCode(code);
    setConverted('idle');
    const target = countries.find((country) => country.code === code);
    if (!target) return;
    const ticket = ++latestConversion.current;
    setConverted('loading');
    try {
      const result = await fetchConvertedAmount(
        current.amountMinor,
        current.currencyCode,
        target.currencyCode,
      );
      if (ticket !== latestConversion.current) return;
      setAmountText(toInputAmount(result.amountMinor, result.currencyCode));
      setConverted('done');
    } catch {
      if (ticket !== latestConversion.current) return;
      setConverted('failed');
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const next: Errors = {};

    const amountMinor = parseMajorToMinor(amountText, currencyCode);
    if (amountText.trim() === '') next.amount = 'Enter the new annual salary';
    else if (amountMinor === null || amountMinor <= 0) next.amount = 'Enter an amount like 1234.50';
    else if (reason === 'raise' && amountMinor <= current.amountMinor) {
      next.amount = 'A raise must be higher than the current salary';
    }
    if (reason === 'promotion' && newLevelId === '') next.level = 'Choose the new level';
    if (reason === 'relocation' && newCountryCode === '') next.country = 'Choose the new country';
    if (effectiveDate === '' || effectiveDate > today) {
      next.date = 'The effective date cannot be in the future';
    } else if (effectiveDate < employee.hireDate) {
      next.date = 'The effective date cannot be before the hire date';
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || amountMinor === null) return;

    const body: SalaryChangeBody = {
      reason,
      effectiveDate,
      amountMinor,
      ...(reason === 'promotion' || (reason === 'correction' && newLevelId !== '')
        ? { newLevelId: Number(newLevelId) }
        : {}),
      ...(reason === 'relocation' ? { newCountryCode } : {}),
    };
    mutation.mutate(body, {
      onSuccess: () => {
        toast.success('Salary change recorded');
        chooseReason('raise');
        setEffectiveDate(today);
        onSaved?.();
      },
      onError: (error) => {
        setServerError(error.message);
      },
    });
  }

  function fieldError(id: string, message: string | undefined) {
    return message ? (
      <p id={id} className="text-xs text-negative">
        {message}
      </p>
    ) : null;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sc-reason">Reason</Label>
          <Select
            id="sc-reason"
            value={reason}
            onChange={(event) => {
              chooseReason(event.target.value as Reason);
            }}
          >
            {REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="sc-date">Effective date</Label>
          <Input
            id="sc-date"
            type="date"
            min={employee.hireDate}
            max={today}
            value={effectiveDate}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? 'sc-date-error' : undefined}
            onChange={(event) => {
              setEffectiveDate(event.target.value);
            }}
          />
          {fieldError('sc-date-error', errors.date)}
        </div>

        {reason === 'promotion' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="sc-level">New level</Label>
            <Select
              id="sc-level"
              value={newLevelId}
              aria-invalid={errors.level ? true : undefined}
              onChange={(event) => {
                setNewLevelId(event.target.value);
              }}
            >
              <option value="">Choose a level</option>
              {higherLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.code} · {level.label}
                </option>
              ))}
            </Select>
            {fieldError('sc-level-error', errors.level)}
          </div>
        )}

        {reason === 'correction' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="sc-level">New level (optional)</Label>
            <Select
              id="sc-level"
              value={newLevelId}
              onChange={(event) => {
                setNewLevelId(event.target.value);
              }}
            >
              <option value="">Keep current level</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.code} · {level.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {reason === 'relocation' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="sc-country">New country</Label>
            <Select
              id="sc-country"
              value={newCountryCode}
              aria-invalid={errors.country ? true : undefined}
              onChange={(event) => {
                void chooseCountry(event.target.value);
              }}
            >
              <option value="">Choose a country</option>
              {destinations.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </Select>
            {fieldError('sc-country-error', errors.country)}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="sc-amount">New annual salary</Label>
          <div className="flex items-center gap-2">
            <Input
              id="sc-amount"
              inputMode="decimal"
              value={amountText}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'sc-amount-error' : undefined}
              disabled={converted === 'loading'}
              onChange={(event) => {
                setAmountText(event.target.value);
              }}
              className="text-right tabular-nums"
            />
            <span className="text-sm text-text-secondary">{currencyCode}</span>
          </div>
          {fieldError('sc-amount-error', errors.amount)}
          {reason === 'relocation' && converted === 'done' && fxDate && (
            <p className="text-xs text-text-secondary">
              Converted at FX rate as of {fxDate} — adjust if needed
            </p>
          )}
          {reason === 'relocation' && converted === 'failed' && (
            <p className="text-xs text-negative">
              Could not convert the current salary. Enter the amount manually.
            </p>
          )}
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

      <Button type="submit" className="self-start" disabled={mutation.isPending}>
        Record change
      </Button>
    </form>
  );
}
