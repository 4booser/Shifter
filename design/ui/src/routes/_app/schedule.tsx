import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card } from '@/components/ui/kit';
import { CREW } from '@/mock/data';
import { cn } from '@/lib/utils';

function Schedule() {
  return (
    <>
      <Head
        said="31 августа — 6 сентября"
        title="Смена «Сова»"
        hint="Кто выходит и когда. Заработок остаётся вашим — на общем графике его нет ни у кого."
        right={
          <>
            <Button size="icon" tone="line"><ChevronLeft className="size-4" /></Button>
            <Button size="icon" tone="line"><ChevronRight className="size-4" /></Button>
            <Button tone="line" size="sm">Команда</Button>
          </>
        }
      />

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="pb-2.5 text-left lbl">Кто</th>
              {['ПН 31', 'ВТ 1', 'СР 2', 'ЧТ 3', 'ПТ 4', 'СБ 5', 'ВС 6'].map((d) => (
                <th key={d} className={cn('pb-2.5 text-center lbl', d === 'ПН 31' && 'text-brass')}>{d}</th>
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
                        one.you ? 'bg-brass text-night' : 'bg-raised text-dim',
                        one.cover === i && 'ring-2 ring-taken',
                      )}>
                        {mark}
                      </span>
                    )}
                  </td>
                ))}
                <td className="py-2 text-right font-mono text-xs tabular">
                  {one.hours} ч
                  <span className="block text-2xs text-faint">{one.days} дн.</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-paper/17">
              <td className="pt-2.5 lbl">На смене</td>
              {[2, 2, 3, 3, 2, 3, 2].map((n, i) => (
                <td key={i} className="pt-2.5 text-center font-mono text-xs font-semibold tabular">
                  {n}{i === 3 && <span className="text-taken">!</span>}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <Card title="Костя просит подменить" hint="Четверг 3 сентября · 17:00–01:00 · бар">
        <div className="flex flex-wrap items-center gap-3">
          <p className="hint flex-1">Взять смену может любой в команде. Отдать — только тот, чья она.</p>
          <Button tone="go" size="sm">Подменю</Button>
        </div>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/schedule')({ component: Schedule });
