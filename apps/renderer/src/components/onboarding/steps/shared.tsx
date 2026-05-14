export function StepHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
        {kicker}
      </span>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}
