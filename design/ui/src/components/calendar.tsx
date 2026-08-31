import { MONTH } from '@/mock/data';
import { cn } from '@/lib/utils';

/**
 * Месяц.
 *
 * В клетке ровно три вещи: число, чем занят день, сколько он принёс. Всё
 * остальное — часы, места, значки — уходит в панель дня: на сетке они
 * превращают месяц в кашу, а ищут по ней взглядом только деньги.
 */
const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

export function Month({ picked = 31 }: { picked?: number }) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 px-1 pb-2 sm:gap-2 sm:px-2">
        {DOW.map((name, index) => (
          <span
            key={name}
            className={cn('lbl', index >= 5 && 'text-brass')}
          >
            {name}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {MONTH.map((day, index) => (
          <div
            key={`${day.n}-${index}`}
            className={cn(
              'flex min-h-16 flex-col gap-1.5 rounded-xl border p-1.5 sm:min-h-24 sm:p-2.5',
              day.blank ? 'border-transparent' : 'border-transparent bg-deep',
              day.today && 'border-brass',
              !day.blank && day.n === picked && !day.today && 'border-paper/17',
            )}
          >
            <span
              className={cn(
                'font-mono text-xs',
                day.blank ? 'text-edge-firm' : 'text-dim',
                day.today && 'text-brass',
              )}
            >
              {day.n}
            </span>

            {day.what !== undefined && (
              <span className="flex items-center gap-1.5 text-xs text-dim">
                <span className="h-3.5 w-[3px] flex-none rounded-sm bg-brass" />
                {/* На ширине пальца от названия остаётся «Ве…» — метка говорит
                    то же самое, а что именно за смена, скажет панель дня. */}
                <span className="hidden truncate sm:inline">{day.what}</span>
              </span>
            )}

            {day.event !== undefined && (
              <span className="flex items-center gap-1.5 text-xs text-faint">
                <span className="h-3.5 w-[3px] flex-none rounded-sm bg-edge-firm" />
                <span className="hidden truncate sm:inline">{day.event}</span>
              </span>
            )}

            {day.amount !== undefined && (
              <span className="mt-auto font-mono text-money tabular">
                {/* «2 470» в клетку шириной в седьмую часть телефона не влезает
                    и переносится на две строки; «2,5К» влезает. */}
                <span className="text-2xs sm:hidden">
                  {`${(Number(day.amount.replace(/\s/g, '')) / 1000).toFixed(1).replace('.', ',')}К`}
                </span>
                <span className="hidden text-sm sm:inline">{day.amount}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * День — как чек с раздачи.
 *
 * Тот же предмет, что человек держит в руках каждую смену: моноширинные
 * цифры встают в столбик, линия отрыва делит план, чаевые и удержания без
 * трёх лишних заголовков, итог внизу — там, где его ищут.
 */
export function Docket() {
  const line = (what: string, val: string, mod?: 'small' | 'minus') => (
    <div className="flex justify-between gap-3 py-1">
      <span className={cn('text-dim', mod === 'small' ? 'text-2xs text-faint' : 'text-xs')}>
        {what}
      </span>
      <span
        className={cn(
          'tabular',
          mod === 'small' ? 'text-2xs text-faint' : 'text-xs',
          mod === 'minus' && 'text-taken',
        )}
      >
        {val}
      </span>
    </div>
  );

  return (
    <div className="card p-5 font-mono">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs tracking-[0.05em] text-dim">ПН 31 АВГУСТА</span>
        <span className="text-2xl font-bold text-money tabular">₴1 640</span>
      </div>

      <div className="tear my-3.5" />
      {line('Вечер · бар', '17:00–01:00')}
      {line('по факту', '17:12–01:40', 'small')}
      {line('перерыв', '30 мин', 'small')}
      {line('8,0 ч × ₴200', '1 600')}

      <div className="tear my-3.5" />
      {line('Чаевые', '400')}
      {line('из них наличными', '150', 'small')}
      {line('Питание', '−90', 'minus')}
      {line('В котёл, 5%', '−20', 'minus')}

      <div className="tear my-3.5" />
      <div className="flex justify-between gap-3 pt-1">
        <span className="text-sm font-semibold">ИТОГО</span>
        <span className="text-sm font-semibold text-money tabular">₴1 890</span>
      </div>
    </div>
  );
}

/**
 * Кривая заработка: накопительно, день за днём.
 *
 * Нарисована как есть, без сглаживания в красивую дугу — месяц с отпуском
 * посередине и должен иметь плато посередине.
 */
export function Climb({
  points,
  ghost,
  height = 150,
  scale = true,
  from = '1 авг',
  mid = '15 авг',
  to = '31 авг',
  format = (value: number) => `₴${value.toFixed(0)}К`,
}: {
  points: number[];
  /** Прошлый период бледной линией — для экрана сравнения. */
  ghost?: number[];
  height?: number;
  scale?: boolean;
  from?: string;
  mid?: string;
  to?: string;
  /** Ряд идёт в тысячах — так его удобно и писать, и подписывать. */
  format?: (value: number) => string;
}) {
  const width = 720;
  // Обе линии меряются одной шкалой. Две шкалы на одном поле — способ
  // показать что угодно: подгоняя их независимо, можно нарисовать рост там,
  // где его нет.
  const peak = Math.max(...points, ...(ghost ?? []), 1);

  const draw = (series: number[]) => {
    const step = width / Math.max(1, series.length - 1);

    return series
      .map((value, index) => `${index === 0 ? 'M' : 'L'} ${index * step} ${height - (value / peak) * (height - 12)}`)
      .join(' ');
  };

  const path = draw(points);

  return (
    <div className={scale ? 'grid grid-cols-[3rem_1fr] gap-2' : undefined}>
      {scale && (
        <div className="flex flex-col justify-between py-0.5 text-right" style={{ height }}>
          {[1, 0.5, 0].map((line) => (
            <span key={line} className="lbl">
              {line === 0 ? '0' : format(peak * line)}
            </span>
          ))}
        </div>
      )}

      <div>
        {/* Высота задана в пикселях, а не оставлена на откуп viewBox: SVG с
            шириной 100% тянет за собой и высоту, и на широком экране график
            вырастает вдвое против задуманного. */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full"
          style={{ height }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e0a45b" stopOpacity="0.22" />
              <stop offset="1" stopColor="#e0a45b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {scale &&
            [0.5].map((line) => (
              <line
                key={line}
                x1="0"
                x2={width}
                y1={height * line}
                y2={height * line}
                stroke="#2e2b29"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

          <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill="url(#wash)" />

          {ghost !== undefined && (
            <path
              d={draw(ghost)}
              fill="none"
              stroke="#7c746b"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path
            d={path}
            fill="none"
            stroke="#e0a45b"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {scale && (
          <div className="mt-1.5 flex justify-between">
            <span className="lbl">{from}</span>
            <span className="lbl">{mid}</span>
            <span className="lbl">{to}</span>
          </div>
        )}
      </div>
    </div>
  );
}
