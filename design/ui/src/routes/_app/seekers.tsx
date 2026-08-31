import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Star } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Card, Field, Pills } from '@/components/ui/kit';
import { Window, Windows } from '@/components/windows';

/** Обратная сторона доски: не «нужен человек», а «ищу смены». */
function Seekers() {
  const [win, setWin] = useState<Window>(null);

  return (
    <>
      <Head
        said="Биржа"
        title="Люди"
        hint="Контакты показаны только теми, кто сам согласился их показать."
        right={
          <>
            <span onClick={() => setWin('callback')}><Button tone="line">Позвать снова</Button></span>
            <Button tone="go">Моя анкета</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pills options={['Объявления', 'Люди']} value="Люди" />
        <Field className="w-40" placeholder="Город" />
        <Pills options={['все', 'бар', 'зал', 'кухня']} value="все" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          { name: 'Костя', what: 'бармен · 4 года', city: 'Днепр', rate: '₴220/ч', stars: '4.9', jobs: 12 },
          { name: 'Марк', what: 'раннер · первый год', city: 'Днепр', rate: '₴150/ч', stars: '4.6', jobs: 3 },
          { name: 'Лена', what: 'повар горячего цеха', city: 'Киев', rate: '₴280/ч', stars: '5.0', jobs: 21 },
          { name: 'Даша', what: 'хостес · 2 года', city: 'Днепр', rate: '₴170/ч', stars: '4.8', jobs: 7 },
        ].map((one) => (
          <article key={one.name} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 flex-none place-items-center rounded-full bg-raised text-sm">
                {one.name[0]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{one.name}</span>
                <span className="hint">{one.what}</span>
              </span>
            </div>
            <p className="hint">{one.city} · {one.jobs} смен по бирже</p>
            <p className="flex items-center gap-1.5 text-sm">
              <Star className="size-3.5 text-brass" />
              <b className="font-semibold tabular">{one.stars}</b>
              <span className="ml-auto font-mono tabular">{one.rate}</span>
            </p>
            <Button tone="line" size="sm">Написать</Button>
          </article>
        ))}
      </div>

      <Card title="Откликнулись на «Бармен на вечер»" hint="Трое. Свободных мест — одно.">
        <div className="flex flex-col">
          {[
            { name: 'Костя', meta: '4.9 · 12 смен', taken: true },
            { name: 'Марк', meta: '4.6 · 3 смены', taken: false },
            { name: 'Лена', meta: '5.0 · 21 смена', taken: false },
          ].map((one) => (
            <span key={one.name} className="flex items-center gap-3 border-b border-paper/9 py-3 last:border-0">
              <span className="grid size-8 flex-none place-items-center rounded-full bg-raised text-xs">
                {one.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{one.name}</span>
                <span className="hint">{one.meta}</span>
              </span>
              {one.taken ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-money">взят</span>
                  <span onClick={() => setWin('review')}><Button tone="quiet" size="sm">Отзыв</Button></span>
                </span>
              ) : (
                <Button tone="go" size="sm">Беру</Button>
              )}
            </span>
          ))}
        </div>
      </Card>

      <Windows open={win} onClose={() => setWin(null)} />
    </>
  );
}

export const Route = createFileRoute('/_app/seekers')({ component: Seekers });
