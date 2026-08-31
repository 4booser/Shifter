import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Camera, Copy, Phone, Plus, Search } from 'lucide-react';

import { Head } from '@/components/screen';
import { Button, Empty, Field, Modal, Over, Pills, Switch } from '@/components/ui/kit';
import { GIGS } from '@/mock/data';
import { plural } from '@/lib/plural';
import { cn } from '@/lib/utils';

/**
 * Биржа подработок.
 *
 * Карточка отвечает на единственный вопрос: это дороже вашего часа или
 * дешевле. Всё остальное — заведение, время, кухня или бар — важно потом,
 * когда ответ уже «дороже».
 *
 * Сравнение считается по вашей же ставке и никому, кроме вас, не видно:
 * заведение не должно знать, во сколько вы себя цените, когда назначает
 * цену.
 */
type Tab = 'доска' | 'мои' | 'отклики';

const MINE = [
  {
    title: 'Бармен на закрытие',
    when: '4 сентября · 18:00—02:00',
    state: 'висит',
    seen: 214,
    replies: 6,
    slots: '1 из 2 закрыт',
  },
  {
    title: 'Официант на банкет',
    when: '29 августа · 12:00—23:00',
    state: 'закрыто',
    seen: 388,
    replies: 11,
    slots: 'взяли двоих',
  },
];

const REPLIES = [
  {
    title: 'Бармен на вечер пятницы',
    venue: 'Бар «Хмель» · Днепр',
    when: '5 сентября · 16:00—23:00',
    state: 'вас зовут' as const,
    said: 'Заведение получило ваши контакты и написало. Осталось ответить.',
  },
  {
    title: 'Повар горячего цеха',
    venue: 'Ресторан «Веранда» · Днепр',
    when: '5 сентября · 12:00—23:00',
    state: 'отправлено' as const,
    said: 'Отклик ушёл вчера. Контактами вы ещё не делились.',
  },
  {
    title: 'Бариста на выходные',
    venue: 'Кофейня «Тчк» · Днепр',
    when: '6 сентября · 08:00—16:00',
    state: 'вы в деле' as const,
    said: 'Смена уже стоит в календаре — по ставке, которую назвали там, а не по вашей обычной.',
  },
];

const STATE: Record<string, string> = {
  'вас зовут': 'border-brass/45 text-brass',
  'отправлено': 'border-paper/17 text-faint',
  'вы в деле': 'border-money/45 text-money',
  'висит': 'border-brass/45 text-brass',
  'закрыто': 'border-paper/17 text-faint',
};

function Board() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pills options={['разовые', 'постоянные']} value="разовые" />
        <Field className="w-40" placeholder="Город" />
        <Pills options={['все', 'бар', 'зал', 'кухня']} value="все" />
        <span className="ml-auto flex gap-2">
          <Pills options={['Неделя', 'Месяц']} value="Неделя" />
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GIGS.map((gig) => (
          <article key={gig.title} className="card flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2">
              <p className="flex-1 font-semibold">{gig.title}</p>
              {gig.urgent === true && (
                <span className="rounded-full border border-taken px-2 py-0.5 text-2xs font-bold text-taken">
                  горит
                </span>
              )}
            </div>
            <p className="hint">
              {gig.venue} · {gig.city}
            </p>
            <p className="font-mono text-2xs text-faint">{gig.when}</p>
            <p className="text-lg font-bold tabular">
              {gig.pay} <span className="text-xs font-normal text-faint">{gig.per}</span>
            </p>
            <p className={cn('text-xs font-semibold', gig.worse === true ? 'text-taken' : 'text-money')}>
              {gig.worth}
            </p>
            {/* Из чего взялся процент. За смену платят одной суммой, и без
                деления на часы «+41%» — это просьба поверить на слово. */}
            <p className="lbl">{gig.hourly}</p>
            {gig.venue === 'Ресторан «Веранда»' && (
              <p className="text-2xs text-faint">здесь вы уже работали: сентябрь 2022 — май 2023</p>
            )}
            <div className="mt-auto flex gap-2 pt-1">
              <Button tone="line" size="sm" className="flex-1">
                Откликнуться
              </Button>
              <Button tone="quiet" size="sm">
                Спросить
              </Button>
            </div>
          </article>
        ))}
      </div>

      <p className="hint">
        «Дороже» и «дешевле» считаются от вашей ставки — ₴200 в час. Не от эффективного часа: чаевые на чужой смене никто не обещает, и подставлять их в сравнение нечестно. Заведение этих цифр не видит.
      </p>
    </>
  );
}

function Mine({ onPost }: { onPost: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {MINE.map((one) => (
        <section key={one.title} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{one.title}</h2>
                <span className={cn('rounded-full border px-2 py-0.5 text-2xs', STATE[one.state])}>
                  {one.state}
                </span>
              </div>
              <p className="hint mt-0.5">{one.when}</p>
              <p className="lbl mt-1">{one.slots}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-right">
                <span className="block font-mono text-sm font-semibold tabular">{one.replies}</span>
                <span className="lbl">{plural(one.replies, 'отклик', 'отклика', 'откликов')}</span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm tabular">{one.seen}</span>
                <span className="lbl">посмотрели</span>
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-paper/9 pt-3">
            <Button tone="line" size="sm">Посмотреть откликнувшихся</Button>
            <Button tone="quiet" size="sm">Править</Button>
            <Button tone="quiet" size="sm">
              <Copy className="size-3.5" />
              Ссылка для чата
            </Button>
            {one.state === 'закрыто' ? (
              <Button tone="quiet" size="sm">Разместить снова</Button>
            ) : (
              <Button tone="quiet" size="sm">Снять</Button>
            )}
          </div>
        </section>
      ))}

      <button type="button" onClick={onPost} className="self-start">
        <Button tone="go">
          <Plus className="size-4" />
          Новое объявление
        </Button>
      </button>
    </div>
  );
}

function Replies() {
  return (
    <div className="flex flex-col gap-3">
      {REPLIES.map((one) => (
        <section key={one.title} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{one.title}</h2>
                <span className={cn('rounded-full border px-2 py-0.5 text-2xs', STATE[one.state])}>
                  {one.state}
                </span>
              </div>
              <p className="hint mt-0.5">{one.venue}</p>
              <p className="font-mono text-2xs text-faint">{one.when}</p>
            </div>
          </div>

          <p className="mt-2.5 text-sm text-dim">{one.said}</p>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-paper/9 pt-3">
            {one.state === 'вас зовут' && (
              <>
                <Button tone="go" size="sm">Я в деле</Button>
                <Button tone="line" size="sm">
                  <Phone className="size-3.5" />
                  Перезвонить
                </Button>
              </>
            )}
            {one.state === 'отправлено' && (
              <>
                <Button tone="line" size="sm">Поделиться контактами</Button>
                <Button tone="quiet" size="sm">Забрать отклик</Button>
              </>
            )}
            {one.state === 'вы в деле' && (
              <Button tone="quiet" size="sm">Открыть в календаре</Button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function Gigs() {
  const [tab, setTab] = useState<Tab>('доска');
  const [posting, setPosting] = useState(false);
  const [quiet, setQuiet] = useState(false);

  return (
    <>
      <Head
        said="Биржа"
        title="Подработки"
        hint="Каждая карточка отвечает на единственный вопрос: это дороже вашего часа или дешевле."
        right={
          <button type="button" onClick={() => setPosting(true)}>
            <Button tone="go">
              <Plus className="size-4" />
              Нужен человек
            </Button>
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(['доска', 'мои', 'отклики'] as const).map((one) => (
          <button key={one} type="button" onClick={() => setTab(one)}>
            <span
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                tab === one ? 'border-brass bg-brass font-semibold text-night' : 'border-paper/17 text-dim',
              )}
            >
              {one === 'доска' ? 'Доска' : one === 'мои' ? 'Мои объявления' : 'Мои отклики'}
            </span>
          </button>
        ))}
        <button type="button" onClick={() => setQuiet((was) => !was)} className="ml-auto">
          <Button tone="quiet" size="sm">
            <Search className="size-3.5" />
            {quiet ? 'Вернуть объявления' : 'Показать пустую доску'}
          </Button>
        </button>
      </div>

      {tab === 'доска' &&
        (quiet ? (
          <Empty
            glyph={<Search className="size-7" />}
            title="В этом окне тихо"
            said="Ни одной подработки на выбранные даты и город. Расширьте окно или поставьте оповещение — напишем, как появится."
            action="Позвать, когда появится"
          />
        ) : (
          <Board />
        ))}

      {tab === 'мои' && <Mine onPost={() => setPosting(true)} />}
      {tab === 'отклики' && <Replies />}

      <Over open={posting} onClose={() => setPosting(false)}>
        <Modal
          title="Нужен человек"
          wide
          said="Чем короче объявление, тем быстрее на него откликнутся."
          foot={
            <>
              <button type="button" onClick={() => setPosting(false)}>
                <Button tone="line" className="w-full">Отмена</Button>
              </button>
              <Button tone="go">Разместить</Button>
            </>
          }
        >
          <Field label="Что за работа" placeholder="Бармен на закрытие" />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Заведение" value="Бар «Полночь»" />
            <Field label="Город" value="Киев" />
          </div>

          <div>
            <span className="lbl">Кого ищете</span>
            <Pills className="mt-2" options={['бар', 'зал', 'кухня', 'хостес']} value="бар" />
          </div>

          <div>
            <span className="lbl">Надолго</span>
            <Pills className="mt-2" options={['одна смена', 'подработка', 'постоянно']} value="одна смена" />
          </div>

          <Field label="График словами" placeholder="2/2 с 10:00, зарплата дважды в месяц" />

          {/* Оплата складывается стопкой: в общепите час, смена и процент с
              продаж сплошь и рядом идут вместе, и объявление, где можно
              выбрать только одно, врёт в обе стороны. */}
          <div>
            <span className="lbl">Оплата — сложите так, как платят на самом деле</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Field label="В час" value="250" />
              <Field label="За смену" placeholder="0" />
              <Field label="Процент с продаж" placeholder="0" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Сколько человек" value="2" />
            <Field label="Когда" value="4 сентября, 18:00—02:00" />
          </div>

          <div>
            <span className="lbl">Фото заведения — не меньше трёх</span>
            <div className="mt-2 flex gap-2">
              {[0, 1, 2].map((one) => (
                <span
                  key={one}
                  className="grid h-16 flex-1 place-items-center rounded-[var(--radius-field)] border border-dashed border-paper/17 text-faint"
                >
                  <Camera className="size-4" />
                </span>
              ))}
            </div>
            <p className="hint mt-1.5">
              Объявление без фотографий листают мимо: по ним понимают, куда идут.
            </p>
          </div>

          <Switch label="Горит" hint="Смена сегодня или завтра — поднимем наверх." />
          <p className="hint">
            В карточке будет: «Бармен на закрытие · Бар «Полночь», Киев · 4 сентября, 18:00—02:00 ·
            ₴250 в час».
          </p>
        </Modal>
      </Over>
    </>
  );
}

export const Route = createFileRoute('/_app/gigs')({ component: Gigs });
