'use client';

/** Remounts on every route change, which is exactly what makes the entry animation replay per navigation — a… */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
