import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Copy, LogOut, UserPlus, Users } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Empty, Field, Modal, Over, Pills } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

/**
 * Команда.
 *
 * Здесь заводят смену и раздают код. Всё, что видит команда, перечислено
 * списком — и рядом сказано, чего она не видит: обещание «заработок ваш»
 * стоит ровно столько, сколько стоит место, где его написали.
 */
function Team() {
  const [none, setNone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (none) {
    return (
      <>
        <Head said="Команда" title="Смены пока нет" />
        <Empty
          glyph={<Users className="size-7" />}
          title="Вы ни в одной команде"
          said="Заведите свою — и раздайте код. Или спросите код из шести букв у того, кто ставит график."
          action="Завести смену"
        />
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <Field label="Код приглашения" placeholder="K7MDPX" />
          <Button tone="line">Войти по коду</Button>
        </div>
        <button type="button" onClick={() => setNone(false)} className="self-start">
          <Button tone="quiet" size="sm">Вернуть команду</Button>
        </button>
      </>
    );
  }

  return (
    <>
      <Head
        said="Команда"
        title="Смена «Полночь»"
        hint="Состав и права. Кто когда выходит — на графике."
        right={
          <>
            <Link to="/schedule">
              <Button tone="line">Открыть график</Button>
            </Link>
            <Button tone="go"><UserPlus className="size-4" />Позвать</Button>
          </>
        }
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
              K7MDPX
            </div>
            <div className="mt-3 flex gap-2">
              <Button tone="line" size="sm" className="flex-1"><Copy className="size-3.5" />Скопировать</Button>
              <Button tone="quiet" size="sm" className="flex-1">Новый код</Button>
            </div>
            <p className="hint mt-3">
              Новый код закрывает старый: тот, у кого на руках прежние шесть букв, войти уже не
              сможет. Это и есть способ выгнать чужого.
            </p>
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

            <div className="mt-3 border-t border-paper/9 pt-3">
              <Field label="Имя, которое видит смена" value="Аня" />
              <p className="hint mt-2">Можно не своё — на графике важно, чтобы вас узнавали.</p>
            </div>
          </Card>

          <Card title="Уйти из команды">
            <p className="hint">
              Ваши смены останутся у вас — они и так были вашими. Из общего графика вы просто
              пропадёте.
            </p>
            <div className="mt-3">
              <button type="button" onClick={() => setLeaving(true)}>
                <Button tone="danger" size="sm">
                  <LogOut className="size-3.5" />
                  Уйти из «Полночи»
                </Button>
              </button>
            </div>
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

      <button type="button" onClick={() => setNone(true)} className="self-start">
        <Button tone="quiet" size="sm">Показать, как без команды</Button>
      </button>

      <Over open={leaving} onClose={() => setLeaving(false)}>
        <Modal
          title="Уйти из «Полночи»?"
          said="Вы владелец: если уйдёте, смену придётся передать кому-то из команды."
          foot={
            <>
              <button type="button" onClick={() => setLeaving(false)}>
                <Button tone="line" className="w-full">Остаться</Button>
              </button>
              <Button tone="danger">Уйти</Button>
            </>
          }
        >
          <Field label="Кому передать смену" value="Ира · менеджер" />
          <p className="hint">
            Ваши смены, деньги и статистика останутся при вас — из команды уходит только ваше имя
            в её графике.
          </p>
        </Modal>
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/team')({ component: Team });
