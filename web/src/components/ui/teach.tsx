'use client';

/** An empty list, used to explain the thing it is empty of. */
export function Teach({
  title,
  example,
  action,
}: {
  title: string;
  /** Lines of the worked example. The last one is drawn as the answer. */
  example: string[];
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="field-hint">{title}</p>

      <div className="rounded-(--radius) border border-dashed border-border px-3 py-2">
        {example.map((line, index) => (
          <p
            key={line}
            className={
              index === example.length - 1
                ? 'text-[0.84rem] font-semibold tabular'
                : 'field-hint tabular'
            }
          >
            {line}
          </p>
        ))}
      </div>

      {action !== undefined && (
        <button type="button" className="btn btn-sm self-start" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
