/**
 * A card with its own header: what it is on the left, the control that belongs
 * to it on the right, a rule underneath, and the body in its own padded box.
 *
 * The old shape put the title inside the padded body, so anything that
 * belonged to the card rather than to the page — a legend, a unit switch, a
 * period picker — had nowhere to sit and ended up as a third line of small
 * print under the chart. Shared by every card on the statistics page so the
 * header sits on the same rule everywhere; the classes themselves live in
 * globals.css as `.card-head` and `.card-body`.
 */
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
  /**
   * The body is a table that carries its own cell padding. Also clips the
   * corners, or the last row's square edge sticks out past the radius.
   */
  flush?: boolean;
  /** Only what the card's place in the page decides — height, span. */
  className?: string;
  children: React.ReactNode;
}) {
  // Колонка, а не просто блок: соседи в ряду растягивают карточку по самому
  // высокому, и невысокий график оставлял под собой пустое поле в полкарточки.
  // Теперь содержимое занимает остаток и стоит по центру этого остатка.
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
