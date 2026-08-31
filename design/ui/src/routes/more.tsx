import { createFileRoute } from '@tanstack/react-router';
import { Check, MessageCircle, Star, X } from 'lucide-react';

import { Frame, Plate, Sheet } from '@/components/frame';
import { Bars, Button, Card, Empty, Field, Pills } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

function More() {
  return (
    <Sheet
      kicker="07 · Остальное"
      title="Всё, что не поместилось"
      blurb="Команда, доска менеджера, люди на бирже, отклики и отзывы, расходы, служебные страницы. Тот же язык, ни одной новой детали."
    >
      <Plate
        title="Управление командой"
        path="/team"
        why="Не график, а состав: кто в команде, кто менеджер, как позвать ещё. Код приглашения — единственное, что отсюда уносят."
      >
        <Frame tab="График">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="lbl">Команда</span>
              <h2 className="mt-1 text-2xl font-bold">Смена «Сова»</h2>
            </div>
            <Button tone="line">Позвать в команду</Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <Card title="Кто в команде">
              <div className="flex flex-col">
                {[
                  ['Аня', 'вы · владелец', '#e0a45b'],
                  ['Ира', 'менеджер', '#7fbf7a'],
                  ['Костя', 'бармен', '#d9705f'],
                  ['Марк', 'стажёр до 15 сентября', '#b5ada3'],
                ].map(([name, role, colour]) => (
                  <span key={name} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
                    <span className="size-2.5 flex-none rounded-full" style={{ background: colour }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{name}</span>
                      <span className="hint">{role}</span>
                    </span>
                    <Button tone="quiet" size="sm">Изменить</Button>
                  </span>
                ))}
              </div>
            </Card>

            <Card title="Код приглашения" hint="Раздайте смене — по нему заходят в общий график.">
              <div className="rounded-[var(--radius-field)] border border-paper/17 bg-night px-3 py-3 text-center font-mono text-lg tracking-[0.3em] select-all">
                SOVA-4K2
              </div>
              <div className="mt-3 flex gap-2">
                <Button tone="line" size="sm" className="flex-1">Скопировать</Button>
                <Button tone="quiet" size="sm" className="flex-1">Сменить</Button>
              </div>
            </Card>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Доска менеджера"
        path="/schedule · планирование"
        why="Здесь смены не отмечают, а раздают. Черновик виден только менеджеру, пока он не опубликован — иначе команда планирует по тому, что ещё передумают."
      >
        <Frame tab="График">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="lbl">Планирование · 7–13 сентября</span>
              <h2 className="mt-1 text-2xl font-bold">Кого куда</h2>
            </div>
            <span className="flex gap-2">
              <Button tone="line" size="sm">Повторить прошлую</Button>
              <Button tone="go" size="sm">Опубликовать 6</Button>
            </span>
          </div>

          <Card>
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="pb-2.5 text-left lbl">Станция</th>
                  {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((d) => (
                    <th key={d} className="pb-2.5 text-center lbl">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Бар', ['', '', 'Аня', 'Аня', 'Аня', 'Костя', 'Костя']],
                  ['Зал', ['Ира', 'Ира', '', 'Марк', 'Марк', 'Ира', 'Ира']],
                  ['Кухня', ['', 'Костя', 'Костя', '', '', 'Марк', '']],
                ].map(([station, week]) => (
                  <tr key={station as string} className="border-t border-paper/9">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-dim">{station as string}</td>
                    {(week as string[]).map((who, i) => (
                      <td key={i} className="py-2 text-center">
                        {who === '' ? (
                          <span className="inline-grid size-7 place-items-center rounded-md border border-dashed border-paper/17 text-faint">+</span>
                        ) : (
                          <span className={cn(
                            'inline-grid h-7 min-w-14 place-items-center rounded-md px-2 text-2xs font-semibold',
                            i > 3 ? 'border border-dashed border-brass text-brass' : 'bg-raised text-paper',
                          )}>
                            {who}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint mt-3">Пунктиром — черновик: команда его пока не видит.</p>
          </Card>
        </Frame>
      </Plate>

      <Plate
        title="Люди на бирже"
        path="/gigs/seekers"
        why="Обратная сторона доски: не «нужен человек», а «ищу смены». Контакты показаны только теми, кто сам согласился."
      >
        <Frame tab="Подработки">
          <div className="flex flex-wrap items-center gap-2">
            <Pills options={['Объявления', 'Люди']} value="Люди" />
            <Field className="w-40" placeholder="Город" />
            <span className="ml-auto"><Button tone="line">Моя анкета</Button></span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['Костя', 'бармен · 4 года', 'Днепр', '₴220/ч', 4.9, 12],
              ['Марк', 'раннер · первый год', 'Днепр', '₴150/ч', 4.6, 3],
              ['Лена', 'повар горячего цеха', 'Киев', '₴280/ч', 5.0, 21],
            ].map(([name, what, city, rate, stars, jobs]) => (
              <div key={name as string} className="card flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 flex-none place-items-center rounded-full bg-raised text-sm">
                    {(name as string)[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{name as string}</span>
                    <span className="hint">{what as string}</span>
                  </span>
                </div>
                <p className="hint">{city as string} · {jobs as number} смен по бирже</p>
                <p className="flex items-center gap-1.5 text-sm">
                  <Star className="size-3.5 text-brass" />
                  <b className="font-semibold tabular">{stars as number}</b>
                  <span className="ml-auto font-mono tabular">{rate as string}</span>
                </p>
                <Button tone="line" size="sm">Написать</Button>
              </div>
            ))}
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Отклики и отзывы"
        path="/gigs/mine · reviews"
        why="Отклик — это человек, а не строка. Поэтому имя, рейтинг и одно действие, а контакты открываются только после согласия обеих сторон."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Откликнулись на «Бармен на вечер»" hint="Трое. Свободных мест — одно.">
            <div className="flex flex-col">
              {[
                ['Костя', '4.9 · 12 смен', true],
                ['Марк', '4.6 · 3 смены', false],
                ['Лена', '5.0 · 21 смена', false],
              ].map(([name, meta, taken]) => (
                <span key={name as string} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
                  <span className="grid size-8 flex-none place-items-center rounded-full bg-raised text-xs">
                    {(name as string)[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{name as string}</span>
                    <span className="hint">{meta as string}</span>
                  </span>
                  {(taken as boolean) ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-money">
                      <Check className="size-3.5" />
                      взят
                    </span>
                  ) : (
                    <span className="flex gap-1.5">
                      <Button tone="go" size="sm">Беру</Button>
                      <Button tone="quiet" size="sm"><X className="size-3.5" /></Button>
                    </span>
                  )}
                </span>
              ))}
            </div>
          </Card>

          <Card title="Оставить отзыв" hint="Открывается только после смены и только двоим, кто на ней был.">
            <div className="flex flex-col gap-3">
              <div>
                <span className="lbl">Как прошло</span>
                <div className="mt-2 flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn('size-6', n <= 4 ? 'text-brass' : 'text-edge-firm')} />
                  ))}
                </div>
              </div>
              <div>
                <span className="lbl">Что отметить</span>
                <Pills className="mt-2" options={['не опоздал', 'быстрый', 'чисто', 'помог закрыться']} value="не опоздал" />
              </div>
              <Field label="Словами" placeholder="Необязательно" area />
              <Button tone="go">Отправить</Button>
            </div>
          </Card>
        </div>
      </Plate>

      <Plate
        title="Что работа стоила"
        path="/costs"
        why="Расходы не вычитаются из заработка: такси домой — это деньги, ушедшие после того, как зарплата пришла. Складывать их в одну цифру значит перестать сходиться с расчёткой."
      >
        <Frame tab="Выплаты">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="lbl">Август</span>
              <h2 className="mt-1 text-2xl font-bold">Во что обошлась работа</h2>
            </div>
            <Button tone="line">Записать расход</Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <Card title="По видам" hint="Ни одна из этих сумм не вычтена из заработка.">
              <Bars rows={[
                { name: 'дорога', under: '38 раз', share: 100, value: '₴3 040', tone: 'taken' },
                { name: 'еда', under: '12 раз', share: 42, value: '₴1 280', tone: 'taken' },
                { name: 'форма', under: '2 раза', share: 22, value: '₴670', tone: 'taken' },
                { name: 'инструмент', under: '1 раз', share: 12, value: '₴350', tone: 'taken' },
              ]} />
            </Card>
            <Card title="Что это значит">
              <p className="text-2xl font-bold tabular">₴5 340</p>
              <p className="hint mt-1">за месяц, это 22% чаевых</p>
              <div className="mt-4 border-t border-paper/9 pt-3">
                <span className="lbl">Час после расходов</span>
                <p className="mt-1 text-xl font-bold tabular">₴141 <span className="text-sm font-normal text-faint">вместо ₴180</span></p>
              </div>
            </Card>
          </div>
        </Frame>
      </Plate>

      <Plate
        title="Служебные страницы"
        path="/status · /whats-new · /assistant"
        why="Их открывают редко и по делу: работает ли сервис, что изменилось, спросить словами."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Как себя чувствует сервис" hint="/status">
            <div className="flex flex-col gap-2.5">
              {[['Приложение', 'работает', 12], ['База', 'работает', 3], ['Уведомления', 'работает', 41]].map(([what, how, ms]) => (
                <span key={what as string} className="flex items-center gap-2.5">
                  <span className="size-2 rounded-full bg-money" />
                  <span className="flex-1 text-sm">{what as string}</span>
                  <span className="hint">{how as string}</span>
                  <span className="font-mono text-2xs text-faint tabular">{ms as number} мс</span>
                </span>
              ))}
              <p className="hint mt-1 border-t border-paper/9 pt-2.5">Без перерывов 27 дней.</p>
            </div>
          </Card>

          <Card title="Что нового" hint="/whats-new">
            <div className="flex flex-col gap-3">
              {[
                ['31 августа', 'Живая смена считает перерыв'],
                ['24 августа', 'Банк показывает, во сколько обходится рабочий день'],
                ['18 августа', 'Обмен сменами внутри команды'],
              ].map(([when, what]) => (
                <span key={when as string} className="border-b border-paper/9 pb-2.5 last:border-0 last:pb-0">
                  <span className="lbl">{when as string}</span>
                  <span className="mt-0.5 block text-sm">{what as string}</span>
                </span>
              ))}
            </div>
          </Card>

          <Card title="Спросить словами" hint="/assistant" right={<MessageCircle className="size-4 text-faint" />}>
            <div className="flex flex-col gap-2.5">
              <span className="self-end rounded-[var(--radius-field)] bg-raised px-3 py-2 text-sm">
                Сколько я заработал в июле?
              </span>
              <span className="rounded-[var(--radius-field)] border border-paper/9 px-3 py-2 text-sm text-dim">
                ₴21 400 за 128 часов. Это на 15% меньше августа.
              </span>
              <Field placeholder="Спросить о своих сменах" />
            </div>
          </Card>
        </div>
      </Plate>

      <Plate title="Когда ещё ничего нет" path="первый запуск" why="Пустой экран — тоже экран: он говорит, с чего начать.">
        <Frame tab="Календарь">
          <Empty
            glyph={<span className="text-3xl">🌙</span>}
            title="Здесь пока пусто"
            said="Заведите смену, которую работаете чаще всего — календарь, деньги и всё остальное построятся вокруг неё."
            action="Завести первую смену"
          />
        </Frame>
      </Plate>
    </Sheet>
  );
}

export const Route = createFileRoute('/more')({ component: More });
