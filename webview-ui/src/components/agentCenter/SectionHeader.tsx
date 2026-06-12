export function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-border bg-btn-bg p-4">
      <div className="text-sm uppercase tracking-wide text-accent-bright">{title}</div>
      <div className="mt-1 text-xs text-text-muted">{subtitle}</div>
    </div>
  );
}
