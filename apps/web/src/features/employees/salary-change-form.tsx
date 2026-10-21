'use client';

import type { EmployeeDetail, SalaryChangeBody, SalaryChangePreviewBody } from '@acme/shared';
import { cn } from 'cn';
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  formatPercentageBp,
  parseMajorToMinor,
  parsePercentageToBp,
  toInputAmount,
} from '@/lib/money';
import {
  fetchConvertedAmount,
  useCountries,
  useCountryName,
  useFxAsOfDate,
  useLevels,
} from '@/features/reference/use-reference';
import { SalaryComparison } from './salary-comparison';
import {
  fetchSalaryPreview,
  usePeerContext,
  useSalaryChange,
  useSalaryPreview,
} from './use-employee';

type Reason = SalaryChangeBody['reason'];

const REASONS: { value: Reason; label: string }[] = [
  { value: 'raise', label: 'Raise' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'relocation', label: 'Relocation' },
  { value: 'correction', label: 'Correction' },
];

const SUBMIT_LABELS: Record<Reason, string> = {
  raise: 'Record raise',
  promotion: 'Record promotion',
  relocation: 'Record relocation',
  correction: 'Record correction',
};

/** Basis points offered as one-click increases; the server turns each into an amount. */
const QUICK_BP: Partial<Record<Reason, number[]>> = {
  raise: [300, 500, 1000, 1500],
  promotion: [1000, 1500, 2000],
};

const COMPARISON_DELAY_MS = 300;

type Pressed = number | 'custom' | null;

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
  const [amountText, setAmountText] = useState(() =>
    toInputAmount(employee.salary.amountMinor, employee.salary.currencyCode),
  );
  const [newLevelId, setNewLevelId] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');
  const [converted, setConverted] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pressed, setPressed] = useState<Pressed>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  /** Counts the latest request that may fill the amount; a stale response is dropped. */
  const latestConversion = useRef(0);

  const current = employee.salary;
  const currentLevel = levels.find((level) => level.id === employee.levelId);
  const higherLevels = levels.filter((level) => level.rank > (currentLevel?.rank ?? Infinity));
  const destinations = countries.filter((country) => country.code !== employee.countryCode);
  const destination = countries.find((country) => country.code === newCountryCode);
  const currencyCode =
    reason === 'relocation' && destination ? destination.currencyCode : current.currencyCode;
  const ownCountryName = useCountryName(employee.countryCode);

  const proposedMinor = parseMajorToMinor(amountText, currencyCode);
  const comparisonBody: SalaryChangePreviewBody | null =
    proposedMinor !== null && proposedMinor > 0 && (reason !== 'relocation' || destination)
      ? {
          reason,
          amountMinor: proposedMinor,
          ...((reason === 'promotion' || reason === 'correction') && newLevelId !== ''
            ? { newLevelId: Number(newLevelId) }
            : {}),
          ...(reason === 'relocation' ? { newCountryCode } : {}),
        }
      : null;
  // The debounced value is a string so that an unchanged request is never a new value.
  const comparisonKey = useDebouncedValue(
    comparisonBody ? JSON.stringify(comparisonBody) : '',
    COMPARISON_DELAY_MS,
  );
  const debouncedBody = useMemo(
    () => (comparisonKey ? (JSON.parse(comparisonKey) as SalaryChangePreviewBody) : null),
    [comparisonKey],
  );
  const comparison = useSalaryPreview(employee.id, debouncedBody);
  const currentPeer = usePeerContext(employee.id).data;

  if (employee.status === 'inactive') {
    return (
      <p className="text-sm text-text-secondary">
        Reactivate this employee to record a salary change. Changes cannot be recorded for inactive
        employees.
      </p>
    );
  }

  /** A relocation waits for a country, then holds the converted amount; every other reason starts from the current salary. */
  function chooseReason(next: Reason, salary = current) {
    latestConversion.current++;
    setReason(next);
    setErrors({});
    setServerError(null);
    setAmountText(
      next === 'relocation' ? '' : toInputAmount(salary.amountMinor, salary.currencyCode),
    );
    setNewLevelId('');
    setNewCountryCode('');
    setConverted('idle');
    setPressed(null);
    setCustomOpen(false);
    setCustomText('');
    setCustomError(null);
    setQuickError(null);
  }

  function reset(salary = current) {
    chooseReason('raise', salary);
    setEffectiveDate(today);
  }

  async function chooseCountry(code: string) {
    const ticket = ++latestConversion.current;
    setNewCountryCode(code);
    setConverted('idle');
    const target = countries.find((country) => country.code === code);
    if (!target) {
      setAmountText('');
      return;
    }
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

  /** The server turns a percentage into an amount; only the latest request fills the field. */
  async function applyPercentage(percentageBp: number) {
    const ticket = ++latestConversion.current;
    setQuickError(null);
    try {
      const result = await fetchSalaryPreview(employee.id, {
        reason,
        percentageBp,
        ...(newLevelId !== '' ? { newLevelId: Number(newLevelId) } : {}),
      });
      if (ticket !== latestConversion.current) return;
      setAmountText(toInputAmount(result.proposed.amountMinor, result.proposed.currencyCode));
    } catch {
      if (ticket !== latestConversion.current) return;
      setQuickError('Could not work out that percentage. Enter the amount instead.');
    }
  }

  function pressQuick(bp: number) {
    setPressed(bp);
    setCustomOpen(false);
    setCustomError(null);
    void applyPercentage(bp);
  }

  function applyCustom() {
    const bp = parsePercentageToBp(customText);
    if (bp === null) {
      setCustomError('Enter a percentage from 0.01 to 100');
      return;
    }
    setCustomError(null);
    setPressed('custom');
    void applyPercentage(bp);
  }

  function onCustomKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyCustom();
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
      onSuccess: (updated) => {
        toast.success('Salary change recorded');
        reset(updated.salary);
        onSaved?.();
      },
      onError: (error) => {
        setServerError(error.message);
      },
    });
  }

  const quickPercentages = QUICK_BP[reason];

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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-text-secondary">Reason</span>
          <SegmentedControl
            label="Reason"
            size="md"
            value={reason}
            options={REASONS}
            onChange={chooseReason}
          />
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
                latestConversion.current++;
                setPressed('custom');
                setAmountText(event.target.value);
              }}
              className="text-right tabular-nums"
            />
            <span className="text-sm text-text-secondary">{currencyCode}</span>
          </div>
          {fieldError('sc-amount-error', errors.amount)}
          {quickPercentages && (
            <div role="group" aria-label="Quick percentages" className="flex flex-wrap gap-1.5">
              {quickPercentages.map((bp) => (
                <QuickButton
                  key={bp}
                  pressed={pressed === bp}
                  onClick={() => {
                    pressQuick(bp);
                  }}
                >
                  {`+${formatPercentageBp(bp)}`}
                </QuickButton>
              ))}
              <QuickButton
                pressed={pressed === 'custom'}
                onClick={() => {
                  setPressed('custom');
                  setCustomOpen(true);
                }}
              >
                Custom %
              </QuickButton>
            </div>
          )}
          {quickPercentages && customOpen && (
            <div className="flex items-center gap-2">
              <Input
                aria-label="Custom percentage"
                inputMode="decimal"
                value={customText}
                aria-invalid={customError ? true : undefined}
                onChange={(event) => {
                  setCustomText(event.target.value);
                }}
                onKeyDown={onCustomKeyDown}
                className="w-24 text-right tabular-nums"
              />
              <span className="text-sm text-text-secondary">%</span>
              <Button type="button" variant="outline" onClick={applyCustom}>
                Apply
              </Button>
            </div>
          )}
          {customError && <p className="text-xs text-negative">{customError}</p>}
          {quickError && <p className="text-xs text-negative">{quickError}</p>}
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

      <SalaryComparison
        employee={employee}
        preview={comparisonBody ? comparison.data : null}
        currentPeer={currentPeer}
        countryName={destination?.name ?? ownCountryName}
        failed={comparison.isError}
      />

      {serverError && (
        <p
          role="alert"
          className="rounded-sm border border-negative/40 bg-negative/5 p-2 text-sm text-negative"
        >
          {serverError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {SUBMIT_LABELS[reason]}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => {
            reset();
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}

function QuickButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'h-10 rounded-sm border px-2.5 text-xs font-medium md:h-7',
        pressed
          ? 'border-accent-tint-border bg-accent-tint text-primary'
          : 'border-border bg-background text-text-secondary hover:bg-surface hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}
