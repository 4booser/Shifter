import { cn } from '@/lib/utils';

/**
 * Графики.
 *
 * Общее правило на все: у каждого есть шкала с числами. Фигура без чисел
 * показывает, что «вот тут больше», и на этом заканчивается — а спрашивают
 * у неё «насколько».
 *
 * Второе правило — цвет здесь ничего не различает. Пять оттенков, которые
 * человек с дальтонизмом видит одним, хуже одного оттенка с подписями;
 * поэтому части названы по имени, а латунь у всех одна.
 */

/* ── циферблат: сутки по кругу ────────────────────────────────────────── */

/**
 * Двадцать четыре часа кольцом, полночь сверху.
 *
 * Смены в общепите переваливают за полночь, и на прямой полосе такая смена
 * разрывается на два куска по краям. На кольце она остаётся одной дугой.
 */
export function Dial({ hours }: { hours: number[] }) {
  const peak = Math.max(...hours, 1);
  const size = 220;
  const mid = size / 2;

  const arc = (index: number, inner: number, outer: number) => {
    const a0 = ((index - 0.5) / 24) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((index + 0.5) / 24) * Math.PI * 2 - Math.PI / 2;
    const p = (r: number, a: number) => `${mid + r * Math.cos(a)} ${mid + r * Math.sin(a)}`;

    return `M ${p(outer, a0)} A ${outer} ${outer} 0 0 1 ${p(outer, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 0 0 ${p(inner, a0)} Z`;
  };

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-[220px] flex-none">
        {hours.map((value, index) => (
          <path
            key={index}
            d={arc(index, 46, 46 + (value / peak) * 58)}
            fill="#e0a45b"
            opacity={0.2 + (value / peak) * 0.8}
          />
        ))}

        {[0, 6, 12, 18].map((mark) => {
          const a = (mark / 24) * Math.PI * 2 - Math.PI / 2;
          return (
            <text
              key={mark}
              x={mid + 32 * Math.cos(a)}
              y={mid + 32 * Math.sin(a) + 4}
              textAnchor="middle"
              className="fill-[#7c746b] font-mono text-[11px]"
            >
              {mark}
            </text>
          );
        })}
      </svg>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-dim">
          Полночь сверху. Чем ярче час, тем больше он приносит.
        </p>
        <dl className="mt-3 flex flex-col gap-1.5">
          {[
            ['Самый дорогой час', '22:00 — 23:00', '₴317'],
            ['Самый долгий', '19:00 — 20:00', '61 раз'],
            ['После полуночи', '00:00 — 02:00', '₴241'],
          ].map(([what, when, num]) => (
            // Три столбца не влезают в ладонь: на узком экране строка
            // переносится, а не растягивает карточку за край.
            <div
              key={what}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
            >
              <dt className="text-faint">{what}</dt>
              <dd className="flex gap-3">
                <span className="font-mono text-dim tabular">{when}</span>
                <span className="w-14 text-right font-mono font-semibold tabular">{num}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/* ── неделя: когда день начинается и когда кончается ──────────────────── */

export interface Span {
  day: string;
  from: number;
  to: number;
  perHour: string;
}

/**
 * Полоса на день недели: где она начинается и где кончается на сутках.
 *
 * Средние «8,2 часа» ничего не говорят о том, что суббота начинается в
 * пять вечера и кончается в два ночи. Отрезок на шкале говорит.
 */
export function Week({ spans }: { spans: Span[] }) {
  const at = (hour: number) => `${(hour / 28) * 100}%`;

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {spans.map((one) => (
          <div key={one.day} className="grid grid-cols-[2rem_1fr_3.5rem] items-center gap-3">
            <span className="lbl">{one.day}</span>
            <span className="relative h-5 rounded bg-deep">
              {[8, 16, 24].map((tick) => (
                <span key={tick} className="absolute top-0 h-full w-px bg-night" style={{ left: at(tick) }} />
              ))}
              <span
                className="absolute top-1 bottom-1 rounded-sm bg-brass"
                style={{ left: at(one.from), width: at(one.to - one.from) }}
              />
            </span>
            <span className="text-right font-mono text-xs tabular">{one.perHour}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-[2rem_1fr_3.5rem] gap-3">
        <span />
        <span className="relative block h-4">
          {/* Шкала идёт до 28: смена, которая кончается в три ночи, кончается
              позже полуночи, а не раньше начала. */}
          {[0, 8, 16, 24, 28].map((tick) => (
            <span
              key={tick}
              className={cn('lbl absolute -translate-x-1/2', tick > 24 && 'text-brass')}
              style={{ left: at(tick) }}
            >
              {tick > 24 ? `${tick - 24}:00` : `${tick}:00`}
            </span>
          ))}
        </span>
        <span className="lbl text-right">в час</span>
      </div>

      <p className="hint mt-3">Последняя отметка — уже следующие сутки.</p>
    </div>
  );
}

/* ── дорожка: как менялась ставка ─────────────────────────────────────── */

/**
 * Линия по неделям с отметкой там, где ставка сдвинулась.
 *
 * Прибавку видно и без графика — а вот тихое снижение, когда часы те же, а
 * час стал дешевле, замечают через полгода. Здесь оно видно на неделе.
 */
export function Track({
  points,
  marks,
  height = 140,
}: {
  points: number[];
  marks: { at: number; said: string }[];
  height?: number;
}) {
  const width = 640;
  const pad = 14;
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = Math.max(1, high - low);
  const x = (index: number) => (index / Math.max(1, points.length - 1)) * width;
  const y = (value: number) => pad + (1 - (value - low) / span) * (height - pad * 2);

  return (
    <div className="grid grid-cols-[3rem_1fr] gap-2">
      {/* Шкала стоит столбиком слева, а не строкой сверху: два числа в ряд
          читаются как «от и до», а это верх и низ оси. */}
      <div className="flex flex-col justify-between text-right" style={{ height }}>
        <span className="lbl">₴{high}</span>
        <span className="lbl">₴{Math.round((high + low) / 2)}</span>
        <span className="lbl">₴{low}</span>
      </div>

      <div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full"
          style={{ height }}
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            x2={width}
            y1={height / 2}
            y2={height / 2}
            stroke="#2e2b29"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {marks.map((mark) => (
            <line
              key={mark.at}
              x1={x(mark.at)}
              x2={x(mark.at)}
              y1="0"
              y2={height}
              stroke="#d9705f"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path
            d={points.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`).join(' ')}
            fill="none"
            stroke="#e0a45b"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="mt-1.5 flex justify-between">
          <span className="lbl">14 недель назад</span>
          <span className="lbl">эта неделя</span>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {marks.map((mark) => (
            <span key={mark.at} className="flex items-center gap-1.5 text-xs text-dim">
              <span className="h-3 w-px bg-taken" />
              {mark.said}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── двенадцать месяцев ───────────────────────────────────────────────── */

/**
 * Год столбиками: что осталось на руках и что срезали.
 *
 * Два куска, а не пять: срезанное — это одна величина, и разбирать её на
 * оттенки в годовом обзоре некуда, для этого есть разбор месяца.
 */
export function Columns({
  months,
  height = 170,
}: {
  months: { name: string; kept: number; cut: number }[];
  height?: number;
}) {
  const peak = Math.max(...months.map((one) => one.kept + one.cut), 1);
  const step = Math.ceil(peak / 3 / 5000) * 5000;
  const top = step * 3;

  return (
    <div>
      <div className="flex gap-3">
        {/* Подписи оси ростом ровно с поле графика. Колонка, растянутая на
            всю карточку, разносит их по местам, где нет никакой линии. */}
        <div
          className="flex w-10 flex-none flex-col justify-between text-right"
          style={{ height }}
        >
          {[3, 2, 1, 0].map((line) => (
            <span key={line} className="lbl">
              {line === 0 ? '0' : `${(step * line) / 1000}К`}
            </span>
          ))}
        </div>

        <div className="relative flex flex-1 items-stretch gap-1" style={{ height }}>
          {[1, 2, 3].map((line) => (
            <span
              key={line}
              className="absolute right-0 left-0 h-px bg-edge"
              style={{ bottom: `${(line / 3) * 100}%` }}
              aria-hidden
            />
          ))}

          {months.map((one, index) => (
            // Столбик тянется на всю высоту поля, иначе проценты внутри него
            // считаются от нуля и график остаётся пустой сеткой.
            <span key={`${one.name}-${index}`} className="flex h-full flex-1 flex-col justify-end">
              <span
                className="w-full rounded-t-sm bg-taken/60"
                style={{ height: `${(one.cut / top) * 100}%` }}
              />
              <span
                className="mt-[2px] w-full bg-brass"
                style={{ height: `${(one.kept / top) * 100}%` }}
              />
            </span>
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex gap-1 pl-[3.25rem]">
        {months.map((one, index) => (
          <span key={`${one.name}-${index}`} className="lbl flex-1 text-center">
            {one.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 pl-[3.25rem]">
        {[
          ['На руки', 'bg-brass'],
          ['Срезали', 'bg-taken/60'],
        ].map(([name, paint]) => (
          <span key={name} className="flex items-center gap-1.5 text-xs text-dim">
            <span className={cn('size-2 rounded-full', paint)} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── цель ─────────────────────────────────────────────────────────────── */

/** Полоса цели с отметкой, куда период приедет к концу, если не менять ход. */
export function Meter({
  reached,
  goal,
  projected,
}: {
  reached: number;
  goal: number;
  projected: number;
}) {
  const share = Math.min(100, (reached / goal) * 100);
  const guess = Math.min(100, (projected / goal) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-2xl font-bold tabular">
          ₴{reached.toLocaleString('ru-RU')}
        </span>
        <span className="hint">из ₴{goal.toLocaleString('ru-RU')}</span>
      </div>

      <div className="relative mt-2.5 h-3 overflow-hidden rounded-full bg-deep">
        <span className="block h-full rounded-full bg-brass" style={{ width: `${share}%` }} />
        <span
          className="absolute top-0 h-full w-0.5 bg-paper"
          style={{ left: `${guess}%` }}
          aria-hidden
        />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <span className="hint">{share.toFixed(0)}% пройдено</span>
        <span className="hint">
          к концу выйдет ₴{projected.toLocaleString('ru-RU')} — это{' '}
          {projected >= goal ? 'выше цели' : `на ₴${(goal - projected).toLocaleString('ru-RU')} меньше`}
        </span>
      </div>
    </div>
  );
}
