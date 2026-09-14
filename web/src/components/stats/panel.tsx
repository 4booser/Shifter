/** A card with its own header: what it is on the left, the control that belongs to it on the right, a rule… */
export function Panel({
  title,
  hint,
  action,
  flush = false,
  className,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  /** The body is a table that carries its own cell padding. */
  flush?: boolean;
  /** Only what the card's place in the page decides — height, span. */
  className?: string;
  children: React.ReactNode;
}) {
  // Колонка, а не просто блок: соседи в ряду растягивают карточку по самому высокому, и невысокий график оставлял…
  return (
    <section className={`card reveal flex flex-col ${flush ? 'overflow-hidden' : ''} ${className ?? ''}`}>
      <header className="card-head">
        <div className="min-w-0">
          <h2 className="card-head-title">{title}</h2>
          {hint !== undefined && <p className="field-hint">{hint}</p>}
        </div>
        {action}
      </header>
      <div className={flush ? 'flex flex-1 flex-col' : 'card-body flex flex-1 flex-col justify-center'}>
        {children}
      </div>
    </section>
  );
}
