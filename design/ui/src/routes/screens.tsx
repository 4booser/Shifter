import { createFileRoute } from '@tanstack/react-router';

import { Frame, Plate, Sheet } from '@/components/frame';
import { Climb, Docket, Month } from '@/components/calendar';
import { Bars, Button, Card, Field, Pills } from '@/components/ui/kit';
import { CLIMB, CREW, GIGS, PAYOUTS, PLACES, SHIFTS, SPEND, STANDING, TILES, WEEKDAY_PAY, YEAR_MONTHS } from '@/mock/data';
import { cn } from '@/lib/utils';

function Screens() {
  return (
    <Sheet
      kicker="02 · Экраны"
      title="Каждая вкладка"
      blurb="Одно окно приложения на поверхность. Навигация нарисованная — ссылки не ведут никуда, потому что это макет."
    >
      <Plate
        title="Календарь"
        path="/"
        why="Главный экран. Сверху — сколько заработано, потому что за этим и открывают. Дальше сетка, где в клетке ровно три вещи. Справа — день как чек с раздачи."
      >
        <Frame tab="Календарь" live="3:07:42 · ₴1 640">
          <div>
            <span className="lbl">Август · заработано</span>
            <p className="mt-1.5 text-5xl font-extrabold tracking-[-0.05em] tabular">
              <span className="font-medium text-faint">₴</span>24 700
            </p>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-dim">
              <span><b className="font-semibold text-paper tabular">17</b> смен</span>
              <span><b className="font-semibold text-paper tabular">137</b> часов</span>
              <span>час стоил <b className="font-semibold text-paper tabular">₴180</b></span>
              <span>чаевые <b className="font-semibold text-paper tabular">₴7 700</b></span>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2.6fr)_minmax(300px,1fr)]">
            <Month />
            <div className="flex flex-col gap-4">
              <Docket />
              <Card title="Цель на месяц">
                <p className="text-xl font-bold tabular">₴24 700 <span className="text-base font-semibold text-faint">из ₴40 000</span></p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-brass" style={{ width: '62%' }} />
                </div>
                <p className="hint mt-2">Осталось ₴15 300 — по ₴15 300 в день.</p>
              </Card>
            </div>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Обзор месяца"
        path="/ · плитки"
        why="Восемь ответов, которые раньше были одинаковыми серыми плашками. Цветом говорит только то, что про деньги."
      >
        <Frame tab="Календарь">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TILES.map((tile) => (
              <div key={tile.said} className="card p-4">
                <span className="lbl">{tile.said}</span>
                <p className={cn(
                  'mt-1.5 text-2xl font-bold tracking-[-0.03em] tabular',
                  tile.tone === 'good' && 'text-money',
                  tile.tone === 'bad' && 'text-taken',
                )}>
                  {tile.num}
                </p>
                <p className="hint mt-0.5">{tile.foot}</p>
              </div>
            ))}
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Статистика"
        path="/stats"
        why="Не один огромный график, а шесть панелей, каждая отвечает на один вопрос и исчезает, когда ответа нет."
      >
        <Frame tab="Год">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="lbl">Статистика · август</span>
              <h2 className="mt-1 text-2xl font-bold">Куда ушёл месяц</h2>
            </div>
            <Pills options={['Месяц', 'Год']} value="Месяц" />
          </div>

          <Card title="Заработано за период" hint="Плотная линия — этот месяц. Плато посередине — отпуск.">
            <Climb points={CLIMB} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Какой день недели платит" hint="Средний заработок за отработанный день.">
              <Bars rows={WEEKDAY_PAY.map((row) => ({ ...row, tone: row.name === 'сб' ? 'brass' as const : undefined }))} />
            </Card>
            <Card title="Что ещё случилось" hint="Мелочи, которые обычно негде увидеть.">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
                {[
                  ['Лучший день', '₴2 470'],
                  ['Ночных часов', '62'],
                  ['Надбавки', '₴2 142'],
                  ['Отдано в котёл', '₴634'],
                  ['Удержано', '₴2 230'],
                  ['Налог', '₴5 955'],
                  ['Гостей', '990'],
                  ['Средний чек', '₴126'],
                ].map(([what, value]) => (
                  <div key={what}>
                    <dt className="lbl">{what}</dt>
                    <dd className="text-sm font-semibold tabular">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Смены"
        path="/shifts"
        why="Шаблоны, из которых строится всё остальное. Карточка отвечает на три вопроса сразу: когда, сколько платят и где."
      >
        <Frame tab="Смены">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="lbl">Шаблоны</span>
              <h2 className="mt-1 text-2xl font-bold">Смены</h2>
            </div>
            <Button tone="go">Новая смена</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SHIFTS.map((shift) => (
              <div key={shift.name} className="card flex gap-3 p-4">
                <span className="mt-1 h-9 w-1 flex-none rounded-full bg-brass" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{shift.symbol} {shift.name}</p>
                  <p className="font-mono text-2xs text-faint">{shift.time} · {shift.hours}</p>
                  <p className="mt-2 text-sm font-semibold tabular">{shift.pay}</p>
                  <p className="hint">{shift.place}{shift.extra ? ` · ${shift.extra}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Места работы"
        path="/places"
        why="Всё, чего не знает шаблон смены: когда приходят деньги, сколько стоит ночь, что удерживает заведение. Карточка показывает только включённые правила — список из «×1» ничего не говорит."
      >
        <Frame tab="Места">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="lbl">Где вы работаете</span>
              <h2 className="mt-1 text-2xl font-bold">Места</h2>
            </div>
            <Button tone="go">Новое место</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {PLACES.map((place) => (
              <div key={place.name} className="card flex gap-3 p-4">
                <span className="mt-1 h-9 w-1 flex-none rounded-full" style={{ background: place.colour }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{place.name}</p>
                  <p className="hint">{place.cycle}</p>
                  <p className="hint mt-0.5">{place.where}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {place.rules.map((rule) => (
                      <span key={rule} className="rounded-full bg-raised px-2 py-0.5 text-2xs text-dim">{rule}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Frame>
      </Plate>

      <Plate
        title="График команды"
        path="/schedule"
        why="Кто выходит и когда. Денег здесь нет ни у кого — общий график, который показывает чужие заработки, приложение обещало не делать. Обводка означает «просят подмену»."
      >
        <Frame tab="График">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="lbl">31 августа — 6 сентября</span>
              <h2 className="mt-1 text-2xl font-bold">Смена «Сова»</h2>
            </div>
            <Pills options={['Прошлая', 'Эта неделя', 'Следующая']} value="Эта неделя" />
          </div>

          <div className="card overflow-x-auto p-4">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="pb-2.5 text-left lbl">Кто</th>
                  {['ПН 31', 'ВТ 1', 'СР 2', 'ЧТ 3', 'ПТ 4', 'СБ 5', 'ВС 6'].map((d) => (
                    <th key={d} className="pb-2.5 text-center lbl">{d}</th>
                  ))}
                  <th className="pb-2.5 text-right lbl">Часы</th>
                </tr>
              </thead>
              <tbody>
                {CREW.map((one) => (
                  <tr key={one.name} className="border-t border-paper/9">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: one.colour }} />
                        {one.name}
                        {one.you && <span className="hint">· вы</span>}
                        {one.trainee && <span className="hint">· стажёр</span>}
                      </span>
                    </td>
                    {one.week.map((mark, i) => (
                      <td key={i} className="py-2 text-center">
                        {mark !== '' && (
                          <span className={cn(
                            'inline-grid size-6 place-items-center rounded-md text-2xs font-bold',
                            'bg-raised text-dim',
                            one.you && 'bg-brass text-night',
                            one.cover === i && 'ring-2 ring-taken',
                          )}>
                            {mark}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 text-right font-mono text-xs tabular">{one.hours} ч</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Подработки"
        path="/gigs"
        why="Каждая карточка отвечает на единственный вопрос, который задают перед подробностями: это дороже моего часа или дешевле. И отвечает в его же деньгах, а не в рейтинге из пяти звёзд."
      >
        <Frame tab="Подработки">
          <div className="flex flex-wrap items-center gap-2">
            <Pills options={['разовые', 'постоянные']} value="разовые" />
            <Field className="w-40" placeholder="Город" />
            <Pills options={['все', 'бар', 'зал', 'кухня']} value="все" />
            <span className="ml-auto"><Button tone="go">Нужен человек</Button></span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {GIGS.map((gig) => (
              <div key={gig.title} className="card flex flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <p className="flex-1 font-semibold">{gig.title}</p>
                  {gig.urgent && (
                    <span className="rounded-full border border-taken px-2 py-0.5 text-2xs font-bold text-taken">горит</span>
                  )}
                </div>
                <p className="hint">{gig.venue} · {gig.city}</p>
                <p className="font-mono text-2xs text-faint">{gig.when}</p>
                <p className="text-lg font-bold tabular">
                  {gig.pay} <span className="text-xs font-normal text-faint">{gig.per}</span>
                </p>
                <p className={cn('text-xs font-semibold', gig.worse ? 'text-taken' : 'text-money')}>
                  {gig.worth}
                </p>
                <span className="mt-1"><Button tone="line" size="sm">Откликнуться</Button></span>
              </div>
            ))}
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Выплаты"
        path="/payouts"
        why="Слева — ближайшие деньги, потому что это единственное, что смотрят двадцать второго числа. Ниже — как заведение платит на самом деле: банк это подтверждает, а память нет."
      >
        <Frame tab="Выплаты">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="card p-5">
              <span className="lbl">Ближайшие деньги</span>
              <p className="mt-1.5 text-4xl font-extrabold text-money tabular">₴16 590</p>
              <p className="hint mt-1">через 5 дней · 5 сентября · Бар «Сова»</p>
            </div>
            <div className="card p-5">
              <span className="lbl">Всего ждём</span>
              <p className="mt-1.5 text-2xl font-bold tabular">₴79 369</p>
              <p className="mt-2 text-sm font-semibold text-taken">₴62 779 задерживают</p>
            </div>
          </div>

          <Card title="Ждём">
            <div className="flex flex-col">
              {PAYOUTS.map((row) => (
                <div key={row.span + row.place} className="flex items-center gap-3 border-b border-paper/9 py-2.5 last:border-0">
                  <span className="size-2 flex-none rounded-full bg-brass" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{row.place}</span>
                      <span className={cn(
                        'text-2xs font-bold',
                        row.state === 'Задержка' ? 'text-taken' : row.state === 'Пришло' ? 'text-money' : 'text-faint',
                      )}>
                        {row.state}
                      </span>
                      {row.late !== undefined && <span className="font-mono text-2xs text-taken">{row.late}</span>}
                    </span>
                    <span className="block font-mono text-2xs text-faint">{row.span} · {row.due}</span>
                  </span>
                  <span className="font-mono text-sm tabular">{row.amount}</span>
                </div>
              ))}
            </div>
          </Card>
        </Frame>
      </Plate>

      <Plate
        title="Банк"
        path="/bank"
        why="То, чего не может ни банк, ни календарь по отдельности: во сколько обходится рабочий день до того, как он что-то заплатил."
      >
        <Frame tab="Банк">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="card p-5">
              <span className="lbl">На карте</span>
              <p className="mt-1.5 text-3xl font-extrabold tabular">₴69 423</p>
            </div>
            <div className="card p-5">
              <span className="lbl">До зарплаты</span>
              <p className="mt-1.5 text-2xl font-bold tabular">₴621 <span className="text-sm font-normal text-faint">в день</span></p>
              <p className="hint mt-1">5 дней · ₴199 обещано подпискам</p>
            </div>
            <div className="card p-5">
              <span className="lbl">Час на самом деле</span>
              <p className="mt-1.5 text-2xl font-bold tabular">₴241 <span className="text-sm font-normal text-faint">вместо ₴250</span></p>
              <p className="hint mt-1">работа съела ₴1 597</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="В смену тратится меньше" hint="22 дня со сменой против 9 без.">
              <Bars rows={[
                { name: 'в смену', share: 68, value: '₴529', tone: 'brass' },
                { name: 'без смены', share: 100, value: '₴778' },
              ]} />
              <p className="hint mt-3">Больше всего расходится дорога.</p>
            </Card>
            <Card title="Куда уходит" hint="Кому платили чаще всего за месяц.">
              <Bars rows={SPEND.map((row, i) => ({ ...row, tone: i === 0 ? 'brass' as const : undefined }))} />
            </Card>
          </div>

          <Card title="Приходит само" hint="Подписки и всё, что списывается по кругу.">
            <div className="flex flex-col">
              {STANDING.map((row) => (
                <div key={row.name} className="flex items-baseline justify-between gap-3 border-b border-paper/9 py-2 last:border-0">
                  <span className="truncate text-sm">{row.name}</span>
                  <span className="font-mono text-sm tabular">
                    {row.amount} <span className="text-2xs text-faint">след. {row.next}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Frame>
      </Plate>

      <Plate
        title="Год"
        path="/wrapped"
        why="Год как один предмет: сумма крупно, месяцы полосами, дни — сеткой квадратов. Чем гуще квадрат, тем больше принёс день."
      >
        <Frame tab="Год">
          <div className="card relative overflow-hidden p-8 text-center">
            <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center text-[13rem] font-black text-paper/[0.03]">2026</span>
            <div className="relative">
              <p className="text-5xl font-extrabold text-money tabular">₴223 687</p>
              <p className="hint mt-2">119 смен · 940 часов · ₴238 за час</p>
              <div className="mx-auto mt-6 flex h-24 max-w-md items-end justify-center gap-1.5">
                {YEAR_MONTHS.map((month, i) => (
                  <span key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <span
                      className="w-full rounded-t-sm bg-brass"
                      style={{ height: `${month.v}%`, opacity: month.v === 70 ? 1 : 0.5 }}
                    />
                    <span className="font-mono text-2xs text-faint">{month.m}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <Card title="Год по дням" hint="Чем гуще квадрат, тем больше принёс день.">
            <div className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto pb-1">
              {Array.from({ length: 245 }, (_, i) => {
                const worked = i % 7 !== 0 && i % 7 !== 1 && i < 168;
                return (
                  <span
                    key={i}
                    className="size-2.5 rounded-[2px]"
                    style={{
                      background: worked ? '#e0a45b' : '#232120',
                      opacity: worked ? 0.35 + ((i * 37) % 60) / 100 : 1,
                    }}
                  />
                );
              })}
            </div>
          </Card>
        </Frame>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/screens')({ component: Screens });
