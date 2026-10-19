'use client';

import { Check, Pencil, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  /** What is shown when not editing. */
  display: ReactNode;
  value: string;
  /** Present for a dropdown, absent for free text. */
  options?: Option[];
  /** Resolves with an error message to keep the editor open, or undefined once saved. */
  onSave: (value: string) => Promise<string | undefined>;
}

/** Single-field edit in place: no drawer or modal round-trip (docs/design.md §5). */
export function InlineField({ label, display, value, options, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    if (trimmed === '') {
      setError(`${label} cannot be empty`);
      return;
    }
    setSaving(true);
    const message = await onSave(trimmed);
    setSaving(false);
    if (message) setError(message);
    else {
      setError(null);
      setEditing(false);
    }
  }

  function cancel() {
    setDraft(value);
    setError(null);
    setEditing(false);
  }

  const id = `inline-${label.toLowerCase().replaceAll(' ', '-')}`;

  return (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={editing ? id : undefined}>{label}</Label>
      {editing ? (
        <>
          <div className="flex items-center gap-1">
            {options ? (
              <Select
                id={id}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                autoFocus
                value={draft}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void save();
                  if (event.key === 'Escape') cancel();
                }}
              />
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={`Save ${label.toLowerCase()}`}
              disabled={saving}
              onClick={() => {
                void save();
              }}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Cancel editing ${label.toLowerCase()}`}
              onClick={cancel}
            >
              <X />
            </Button>
          </div>
          {error && <p className="text-xs text-negative">{error}</p>}
        </>
      ) : (
        <div className="flex items-center gap-1 text-sm">
          <span className="min-w-0 break-words">{display}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 md:size-6"
            aria-label={`Edit ${label.toLowerCase()}`}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            <Pencil className="size-3!" />
          </Button>
        </div>
      )}
    </div>
  );
}
