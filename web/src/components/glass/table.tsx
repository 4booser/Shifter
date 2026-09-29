import type { ReactNode } from 'react';

/** A table in a well: unit captions in the header, tabular figures, hairline rows, a total on a thicker one. */
export function GlassTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass-well overflow-x-auto p-2 ${className ?? ''}`}>
      <table className="w-full text-[0.82rem]">{children}</table>
    </div>
  );
}

export function Th({ children, right = false, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={`th px-3 py-2 ${right ? 'text-right' : 'text-left'} ${className ?? ''}`}>{children}</th>;
}

export function Td({
  children,
  right = false,
  strong = false,
  className,
  colSpan,
}: {
  children?: ReactNode;
  right?: boolean;
  strong?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 ${right ? 'text-right tabular' : ''} ${strong ? 'font-semibold' : ''} ${className ?? ''}`}>
      {children}
    </td>
  );
}

export function Tr({ children, total = false, className }: { children: ReactNode; total?: boolean; className?: string }) {
  return <tr className={`${total ? 'table-total font-bold' : 'table-row'} ${className ?? ''}`}>{children}</tr>;
}
