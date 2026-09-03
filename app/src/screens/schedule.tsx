import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  HandHelping,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { RotaEntry, teamApi } from '@/lib/api/team';
import { keysBetween, shiftDays, todayKey, weekBounds } from '@/lib/calendar/calendar-date';
import { daysWord } from '@/lib/text/plural';
import { cn } from '@/lib/utils';

/**
 * The rota: who is on, and when, for the week somebody is inside.
 *
 * Names down the side, days across the top, and a mark where the two meet —
 * the shape every printed rota in the trade already has, so nobody has to
 * learn this one. Money is nowhere on it: a shared rota that leaks wages is
 * the thing this app promised never to be. Hours and days are the rota's own
 * business and stay.
 *
 * A cell opens rather than only informing, because the thing people do with a
 * rota is swap shifts on it.
 */
export function Schedule() {
  const client = useQueryClient();

  const teams = useQuery({ queryKey: ['teams'], queryFn: () => teamApi.list() });
  const team = teams.data?.[0] ?? null;

  const today = todayKey();
  const [anchor, setAnchor] = useState(today);
  const { from: monday, to: sunday } = weekBounds(anchor);
  const days = keysBetween(monday, sunday);

  const rota = useQuery({
    queryKey: ['rota', team?.id, monday, sunday],
    queryFn: () => teamApi.rota(team!.id, monday, sunday),
    enabled: team !== null,
  });

  const [picked, setPicked] = useState<RotaEntry | null>(null);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['rota'] });
    setPicked(null);
  };

  const offer = useMutation({
    mutationFn: (dayShiftId: number) => teamApi.offerCover(team!.id, dayShiftId),
    onSuccess: () => {
      refresh();
      toast.success('Вы вызвались подменить — теперь слово за тем, чья смена');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const withdraw = useMutation({
    mutationFn: (offerId: number) => teamApi.withdrawCover(team!.id, offerId),
    onSuccess: () => {
      refresh();
      toast.success('Больше не вызываетесь');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accept = useMutation({
    mutationFn: (offerId: number) => teamApi.acceptCover(team!.id, offerId),
    onSuccess: (taken) => {
      refresh();
      // This runs for the person giving the shift away, so it comes off their
      // own calendar. The taker places it themselves — at their own rate,
      // which is why the server will not write it for them — and gets a push
      // saying so.
      void client.invalidateQueries({ queryKey: ['days'] });
      toast.success(`${taken.shift_name} теперь у ${taken.taken_by} — им придёт напоминание поставить её себе`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (teams.isPending) return <Skeleton className="h-56 rounded-[var(--radius-card)]" />;

  if (team === null) return <NoTeam />;

  const thisWeek = weekBounds(today).from === monday;
  const busy = offer.isPending || withdraw.isPending || accept.isPending;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Прошлая неделя"
              onClick={() => setAnchor((was) => shiftDays(was, -7))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Следующая неделя"
              onClick={() => setAnchor((was) => shiftDays(was, 7))}
            >
              <ChevronRight className="size-4" />
            </Button>
            {!thisWeek && (
              <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
                Эта неделя
              </Button>
            )}
          </span>
          <span className="field-hint tabular">
            {Number(monday.slice(8))}–{Number(sunday.slice(8))}{' '}
            {new Date(`${sunday}T12:00:00`)
              .toLocaleDateString('ru', { day: 'numeric', month: 'long' })
              .replace(/^\d+\s*/, '')}
          </span>
        </div>

        <Button variant="ghost" size="sm" asChild>
          <a href="/schedule">
            Старая версия
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </header>

      {rota.isPending ? (
        <Skeleton className="h-56 rounded-[var(--radius-card)]" />
      ) : rota.data === undefined ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <>
          {rota.data.needs_second_factor && (
            <p
              className="card flex items-center gap-2 p-3 text-sm"
              style={{ background: 'var(--warn-soft)' }}
            >
              <ShieldAlert className="size-4 flex-none" />
              Общие итоги команды скрыты, пока у вас не включён вход по коду.
            </p>
          )}

          <section className="card overflow-x-auto p-4">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="pb-2 text-left text-2xs font-semibold uppercase tracking-wide text-faint">
                    Кто
                  </th>
                  {days.map((key) => (
                    <th
                      key={key}
                      className={cn(
                        'pb-2 text-center text-2xs font-semibold uppercase tracking-wide',
                        key === today ? 'text-accent-foreground' : 'text-faint',
                      )}
                    >
                      {new Date(`${key}T12:00:00`).toLocaleDateString('ru', { weekday: 'short' })}
                      <span className="ml-1 tabular">{Number(key.slice(8))}</span>
                    </th>
                  ))}
                  <th className="pb-2 pl-3 text-right text-2xs font-semibold uppercase tracking-wide text-faint">
                    Часы
                  </th>
                </tr>
              </thead>

              <tbody>
                {rota.data.members.map((member) => (
                  <tr key={member.member_id} className="border-t border-border">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="size-2.5 flex-none rounded-full"
                          style={{ background: member.colour }}
                        />
                        <span className="truncate" title={member.display_name}>{member.display_name}</span>
                        {member.is_you && <span className="field-hint">· вы</span>}
                        {member.trainee && <span className="field-hint">· стажёр</span>}
                      </span>
                    </td>

                    {days.map((key) => {
                      const entries = rota.data.entries.filter(
                        (entry) => entry.member_id === member.member_id && entry.date === key,
                      );
                      const gigs = rota.data.gig_outings.filter(
                        (gig) => gig.member_id === member.member_id && gig.date === key,
                      );

                      return (
                        <td key={key} className="py-1.5 text-center align-top">
                          <span className="flex flex-col items-center gap-0.5">
                            {entries.map((entry) => (
                              <button
                                key={entry.day_shift_id}
                                type="button"
                                title={`${entry.shift_name} ${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}`}
                                onClick={() => setPicked(entry)}
                                className={cn(
                                  'grid size-6 place-items-center rounded text-2xs font-bold transition-transform hover:scale-110',
                                  // A ring rather than another colour: the
                                  // square already carries whose shift it is.
                                  entry.offers.length > 0 && 'ring-2 ring-[var(--warn)]',
                                  picked?.day_shift_id === entry.day_shift_id &&
                                    'ring-2 ring-[var(--accent)]',
                                )}
                                style={{
                                  background: entry.member_colour,
                                  color: 'var(--accent-ink)',
                                  opacity: entry.worked ? 1 : 0.6,
                                }}
                              >
                                {entry.symbol ?? entry.shift_name.slice(0, 1)}
                              </button>
                            ))}
                            {gigs.map((gig, index) => (
                              <span
                                key={`${gig.date}-${index}`}
                                title="Подработка на стороне"
                                className="text-muted-foreground"
                              >
                                <Sparkles className="size-3" />
                              </span>
                            ))}
                          </span>
                        </td>
                      );
                    })}

                    <td className="py-2 pl-3 text-right whitespace-nowrap tabular">
                      <span className="block text-xs font-semibold">
                        {Math.round(member.hours)} ч
                      </span>
                      <span className="field-hint">
                        {member.days} {daysWord(member.days)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-border-strong">
                  <td className="pt-2 text-2xs uppercase tracking-wide text-faint">На смене</td>
                  {days.map((key) => {
                    const day = rota.data.days.find((row) => row.date === key);

                    return (
                      <td key={key} className="pt-2 text-center text-xs font-semibold tabular">
                        {day?.on_shift ?? 0}
                        {(day?.cover_requests ?? 0) > 0 && (
                          <span className="ml-0.5 text-warn" title="Кто-то отдаёт смену">
                            !
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          {picked !== null && (
            <ShiftSheet
              entry={picked}
              busy={busy}
              onClose={() => setPicked(null)}
              onOffer={() => offer.mutate(picked.day_shift_id)}
              onWithdraw={(offerId) => withdraw.mutate(offerId)}
              onAccept={(offerId) => accept.mutate(offerId)}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * What can be done with one shift on the rota.
 *
 * A strip under the grid rather than a dialog: handing a shift over is a
 * decision made while looking at the week around it, and a modal takes the
 * week away.
 */
function ShiftSheet({
  entry,
  busy,
  onClose,
  onOffer,
  onWithdraw,
  onAccept,
}: {
  entry: RotaEntry;
  busy: boolean;
  onClose: () => void;
  onOffer: () => void;
  onWithdraw: (offerId: number) => void;
  onAccept: (offerId: number) => void;
}) {
  const mine = entry.offers.find((one) => one.is_you) ?? null;
  const past = entry.date < todayKey();

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          <span className="block font-semibold">
            {entry.symbol != null && `${entry.symbol} `}
            {entry.shift_name}
          </span>
          <span className="field-hint tabular">
            {new Date(`${entry.date}T12:00:00`).toLocaleDateString('ru', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            · {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)} · {entry.hours} ч
          </span>
        </span>

        {entry.needs_cover && (
          <span className="field-hint flex items-center gap-1">
            <HandHelping className="size-3.5" />
            {entry.is_mine ? 'Вы просите подмену' : 'Ищут подмену'}
          </span>
        )}

        <span className="ml-auto flex flex-wrap gap-2">
          {/* Volunteering is for somebody else's shift, and only once they
              have asked: the server refuses both otherwise, and a button
              that exists only to be refused is worse than no button. */}
          {!entry.is_mine && entry.needs_cover && !past && mine === null && (
            <Button size="sm" disabled={busy} onClick={onOffer}>
              Подменю
            </Button>
          )}
          {!entry.is_mine && mine !== null && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onWithdraw(mine.offer_id)}
            >
              Передумал
            </Button>
          )}
          {entry.is_mine && !entry.needs_cover && (
            <span className="field-hint">
              Попросить подмену можно в своём дне, в календаре.
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </span>
      </div>

      {/* Only the owner hands the shift over, and only to somebody who has
          put their hand up. */}
      {entry.is_mine && entry.offers.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="field-label">Вызвались подменить</span>
          {entry.offers.map((one) => (
            <span key={one.offer_id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm" title={one.display_name}>{one.display_name}</span>
              <Button size="sm" disabled={busy || past} onClick={() => onAccept(one.offer_id)}>
                Отдать
              </Button>
            </span>
          ))}
        </div>
      )}

      {entry.is_mine && entry.needs_cover && entry.offers.length === 0 && (
        <p className="field-hint border-t border-border pt-3">
          Пока никто не вызвался. Команде уже прилетело уведомление.
        </p>
      )}
    </section>
  );
}

/** No crew yet: joining one is the screen, rather than a link off it. */
function NoTeam() {
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const join = useMutation({
    mutationFn: () => teamApi.join(code.trim(), null),
    onSuccess: (team) => {
      void client.invalidateQueries({ queryKey: ['teams'] });
      toast.success(`Вы в команде «${team.name}»`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const create = useMutation({
    mutationFn: () => teamApi.create(name.trim()),
    onSuccess: (team) => {
      void client.invalidateQueries({ queryKey: ['teams'] });
      toast.success(`Команда «${team.name}» создана`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <section className="card p-6 text-center">
        <Users className="mx-auto mb-2 size-6 text-accent-foreground" />
        <p className="text-lg font-semibold">Вы пока не в команде</p>
        <p className="field-hint">
          Общий график показывает, кто выходит и когда. Заработок остаётся вашим — на роте его
          нет ни у кого.
        </p>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <span className="field-label">У меня есть код приглашения</span>
        <span className="flex gap-2">
          <Input
            value={code}
            placeholder="Код от команды"
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && code.trim() !== '') join.mutate();
            }}
          />
          <Button disabled={code.trim() === '' || join.isPending} onClick={() => join.mutate()}>
            Войти
          </Button>
        </span>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <span className="field-label">Или собрать свою</span>
        <span className="flex gap-2">
          <Input
            value={name}
            placeholder="Название команды"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim() !== '') create.mutate();
            }}
          />
          <Button
            variant="outline"
            disabled={name.trim() === '' || create.isPending}
            onClick={() => create.mutate()}
          >
            Создать
          </Button>
        </span>
      </section>
    </div>
  );
}
