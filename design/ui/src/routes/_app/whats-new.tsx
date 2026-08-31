import { createFileRoute } from '@tanstack/react-router';

import { Head } from '@/components/screen';

/**
 * Что нового.
 *
 * Каждая запись названа тем, что человек заметит, а не тем, что поменялось
 * в коде. «Ночь замков» вместо «ротация токенов» — потому что читать это
 * будет бармен, а не тот, кто её выкатил.
 */
const NEWS = [
  {
    when: '31 августа 2026',
    title: 'Ночь замков',
    body: 'Вход в два шага, коды на бумажке про запас и выход из чужих устройств одной кнопкой.',
    items: ['Двухфакторный вход', 'Запасные коды', 'Список сессий'],
  },
  {
    when: '24 августа 2026',
    title: 'Телефон догнал',
    body: 'Всё, что умеет сайт, теперь умеет и приложение: живая смена, банк, команда.',
    items: ['Живая смена на телефоне', 'Виджет на экране', 'Оффлайн-правки'],
  },
  {
    when: '9 августа 2026',
    title: 'Год одним взглядом',
    body: 'Двенадцать месяцев сворачиваются в постер: сколько смен, часов и денег.',
    items: ['Годовой отчёт', 'Карточка для сторис'],
  },
  {
    when: '27 июля 2026',
    title: 'Доска управляющего',
    body: 'Кто вышел, кому не хватает смен, где дыра в графике на следующей неделе.',
    items: ['Общий график', 'Прикрытие смен', 'Роли в команде'],
  },
  {
    when: '14 июля 2026',
    title: 'Статистику перерисовали',
    body: 'Полосы вместо кругов, подписи вместо легенды, и у каждой шкалы появились цифры.',
    items: ['Дни недели', 'Сравнение периодов', 'Что работа стоила'],
  },
  {
    when: '2 июля 2026',
    title: 'График, снятый на телефон',
    body: 'Лист со стены превращается в смены: снимок, проверка, готово.',
    items: ['Импорт с фото', 'Разбор конфликтов'],
  },
];

function WhatsNew() {
  return (
    <>
      <Head
        said="История"
        title="Что нового"
        hint="Названо по тому, что вы заметите, а не по тому, что поменялось внутри."
      />

      <div className="flex max-w-3xl flex-col gap-4">
        {NEWS.map((one) => (
          <article key={one.when} className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-bold">{one.title}</h2>
              <span className="font-mono text-xs text-faint">{one.when}</span>
            </div>
            <p className="mt-1.5 text-sm text-dim">{one.body}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {one.items.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-paper/9 px-2.5 py-1 text-2xs text-faint"
                >
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export const Route = createFileRoute('/_app/whats-new')({ component: WhatsNew });
