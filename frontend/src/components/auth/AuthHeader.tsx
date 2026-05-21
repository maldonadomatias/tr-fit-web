type AuthHeaderProps = {
  eyebrow: string;
  title: string;
  sub: string;
};

export function AuthHeader({ eyebrow, title, sub }: AuthHeaderProps) {
  return (
    <div className="mb-8">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
        {eyebrow}
      </div>
      <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      <p className="mt-1.5 text-sm leading-[1.5] text-muted-foreground">
        {sub}
      </p>
    </div>
  );
}
