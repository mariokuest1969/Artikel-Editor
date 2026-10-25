export function Section({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-6 border-t py-10 lg:grid-cols-[280px_1fr]" data-testid={`section-${id}`}>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight">{title}</h3>
        {description && <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</div>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export function StatusPill({ ok, okText, badText, testId }: { ok: boolean; okText: string; badText: string; testId: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-600" : "bg-amber-500"}`} />
      {ok ? okText : badText}
    </span>
  );
}
