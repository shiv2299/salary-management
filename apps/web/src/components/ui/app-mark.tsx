import { cn } from 'cn';

/** The app's small accent square and name; `dark` is for use on the navy brand panel. */
export function AppMark({
  tone = 'light',
  nameClassName,
}: {
  tone?: 'light' | 'dark';
  nameClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className="size-4 shrink-0 rounded-sm bg-primary" />
      <span
        className={cn(
          'text-base font-semibold',
          tone === 'dark' ? 'text-white' : 'text-text-primary',
          nameClassName,
        )}
      >
        Salary Management
      </span>
    </span>
  );
}
