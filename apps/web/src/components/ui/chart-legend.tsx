/** The key for a chart with several series: a swatch and a name for each. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul
      aria-label="Chart key"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
