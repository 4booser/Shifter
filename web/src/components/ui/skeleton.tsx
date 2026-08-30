/**
 * The shape of what is coming, instead of a sentence about it. A block the
 * size of the real thing keeps the page from jumping when the data lands,
 * and a short stack reads as «a list is on its way» without pretending to
 * be the list.
 */
export function Skeleton({ height, className }: { height?: string; className?: string }) {
  return <div aria-hidden className={`skeleton ${className ?? ''}`.trim()} style={{ height }} />;
}

export function SkeletonRows({
  rows = 3,
  height = '3.5rem',
  className,
}: {
  rows?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div aria-busy="true" className={`flex flex-col gap-2 ${className ?? ''}`.trim()}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={height} className="w-full" />
      ))}
    </div>
  );
}
