import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { teamApi } from '@/lib/api/team';
import { keysBetween, todayKey } from '@/lib/calendar/calendar-date';
import { cn } from '@/lib/utils';

/**
 * The rota: who is on, and when, for the week somebody is inside.
 *
 * Names down the side, days across the top, and a mark where the two meet —
 * the shape every printed rota in the trade already has, so nobody has to
 * learn this one. Money is nowhere on it: a shared rota that leaks wages is
 * the thing this app promised never to be.
 */
export function Schedule() {
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => teamApi.list() });
  const team = teams.data?.[0] ?? null;

  const today = todayKey();
  const monday = (() => {
    const at = new Date(`${today}T12:00:00`);

    at.setDate(at.getDate() - ((at.getDay() + 6) % 7));

    return at.toISOString().slice(0, 10);
  })();
  const sunday = (() => {
    const at = new Date(`${monday}T12:00:00`);

    at.setDate(at.getDate() + 6);

    return at.toISOString().slice(0, 10);
  })();

  const rota = useQuery({
    queryKey: ['rota', team?.id, monday, sunday],
    queryFn: () => teamApi.rota(team!.id, monday, sunday),
    enabled: team !== null,
  });

  const days = keysBetween(monday, sunday);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">График</h1>
        <Button variant="ghost" size="sm" asChild>
          <a href="/schedule">
            Старая версия
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </header>

      {teams.isPending ? (
        <Skeleton className="h-56 rounded-[var(--radius-card)]" />
      ) : team === null ? (
        <section className="card mx-auto max-w-md p-6 text-center">
          <Users className="mx-auto mb-2 size-6 text-accent-foreground" />
          <p className="text-lg font-semibold">Вы пока не в команде</p>
          <p className="field-hint mb-3">
            Общий график показывает, кто выходит и когда — без чужих денег.
          </p>
          <Button asChild>
            <a href="/team">
              Присоединиться или создать
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </section>
      ) : rota.isPending ? (
        <Skeleton className="h-56 rounded-[var(--radius-card)]" />
      ) : rota.data === undefined ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-3 text-base font-bold">{team.name}</h2>

          <table className="w-full min-w-[42rem] border-collapse text-sm">
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
                      <span className="truncate">{member.display_name}</span>
                      {member.is_you && <span className="field-hint">· вы</span>}
                    </span>
                  </td>

                  {days.map((key) => {
                    const entries = rota.data.entries.filter(
                      (entry) => entry.member_id === member.member_id && entry.date === key,
                    );

                    return (
                      <td key={key} className="py-1.5 text-center align-top">
                        <span className="flex flex-col items-center gap-0.5">
                          {entries.map((entry) => (
                            <span
                              key={entry.day_shift_id}
                              title={`${entry.shift_name} ${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}`}
                              className="grid size-5 place-items-center rounded text-2xs font-bold"
                              style={{
                                background: entry.member_colour,
                                color: 'var(--accent-ink)',
                                opacity: entry.worked ? 1 : 0.55,
                              }}
                            >
                              {entry.symbol ?? entry.shift_name.slice(0, 1)}
                            </span>
                          ))}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
