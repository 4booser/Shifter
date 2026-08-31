import { createFileRoute } from '@tanstack/react-router';
import { Copy, UserPlus } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Pills } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

function Team() {
  return (
    <>
      <Head
        said="Команда"
        title="Смена «Сова»"
        hint="Состав и права. Кто когда выходит — на графике."
        right={<Button tone="go"><UserPlus className="size-4" />Позвать</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
        <Card title="Кто в команде">
          <div className="flex flex-col">
            {[
              { name: 'Аня', role: 'вы · владелец', colour: '#e0a45b' },
              { name: 'Ира', role: 'менеджер', colour: '#7fbf7a' },
              { name: 'Костя', role: 'бармен', colour: '#d9705f' },
              { name: 'Марк', role: 'стажёр до 15 сентября', colour: '#b5ada3' },
            ].map((one) => (
              <span key={one.name} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
                <span className="size-2.5 flex-none rounded-full" style={{ background: one.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{one.name}</span>
                  <span className="hint">{one.role}</span>
                </span>
                <Button tone="quiet" size="sm">Изменить</Button>
              </span>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Код приглашения" hint="Раздайте смене — по нему заходят в общий график.">
            <div className="rounded-[var(--radius-field)] border border-paper/17 bg-night px-3 py-3 text-center font-mono text-lg tracking-[0.3em] select-all">
              SOVA-4K2
            </div>
            <div className="mt-3 flex gap-2">
              <Button tone="line" size="sm" className="flex-1"><Copy className="size-3.5" />Скопировать</Button>
              <Button tone="quiet" size="sm" className="flex-1">Сменить</Button>
            </div>
          </Card>

          <Card title="Что видит команда" hint="Всё остальное остаётся вашим.">
            <ul className="flex flex-col gap-2 text-sm text-dim">
              <li>Когда вы выходите</li>
              <li>Сколько часов за неделю</li>
              <li>Просите ли подмену</li>
            </ul>
            <p className="hint mt-3 border-t border-paper/9 pt-3">
              Заработок, чаевые и удержания не видит никто, включая владельца.
            </p>
          </Card>
        </div>
      </div>

      <Card title="Планирование" hint="Черновик виден только менеджеру, пока не опубликован.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pills options={['7–13 сент.', '14–20 сент.']} value="7–13 сент." />
          <span className="ml-auto flex gap-2">
            <Button tone="line" size="sm">Повторить прошлую</Button>
            <Button tone="go" size="sm">Опубликовать 6</Button>
          </span>
        </div>

        <div className="overflow-x-auto">
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
                { station: 'Бар', week: ['', '', 'Аня', 'Аня', 'Аня', 'Костя', 'Костя'] },
                { station: 'Зал', week: ['Ира', 'Ира', '', 'Марк', 'Марк', 'Ира', 'Ира'] },
                { station: 'Кухня', week: ['', 'Костя', 'Костя', '', '', 'Марк', ''] },
              ].map((row) => (
                <tr key={row.station} className="border-t border-paper/9">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-dim">{row.station}</td>
                  {row.week.map((who, i) => (
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
        </div>
        <p className="hint mt-3">Пунктиром — черновик: команда его пока не видит.</p>
      </Card>
    </>
  );
}

export const Route = createFileRoute('/_app/team')({ component: Team });
