'use client';

/** The centred card both auth pages share. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-scene grid min-h-dvh place-items-center px-4 py-10">
      <div className="card rise glow w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl text-lg font-bold"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            S
          </span>
          <div>
            <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight">{title}</h1>
            <p className="field-hint">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
