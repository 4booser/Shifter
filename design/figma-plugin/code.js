/*
 * Shifter — сборка макета.
 *
 * Строит файл кодом: цветовые и текстовые стили, потом экраны. Запускается
 * из Figma (Plugins → Development → Import plugin from manifest…), правится
 * здесь и перезапускается — макет воспроизводим, а не нарисован однажды.
 *
 * Всё, что плагин создаёт, помечено именами с префиксом, и при повторном
 * запуске старое удаляется: иначе второй прогон кладёт вторую копию поверх
 * первой, и файл превращается в свалку.
 */

const PREFIX = 'SH/';

/* ── язык ──────────────────────────────────────────────────────────────── */

const C = {
  night: '#0B0A09',
  deep: '#121110',
  table: '#1A1816',
  raised: '#232120',
  edge: '#2E2B29',
  faintEdge: '#423E3B',

  paper: '#F2EDE6',
  dim: '#B5ADA3',
  faint: '#7C746B',

  brass: '#E0A45B',
  brassLit: '#F5BE7A',
  money: '#7FBF7A',
  taken: '#D9705F',
};

const SANS = 'Inter';
const MONO = 'Roboto Mono';

/* ── мелочи ────────────────────────────────────────────────────────────── */

function rgb(hex) {
  const clean = hex.replace('#', '');

  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

const fill = (hex, opacity) => [
  { type: 'SOLID', color: rgb(hex), opacity: opacity === undefined ? 1 : opacity },
];

/** Вертикальный или горизонтальный авто-лэйаут — основа всей вёрстки. */
function box(name, options) {
  const o = options || {};
  const node = figma.createFrame();

  node.name = name;
  node.layoutMode = o.dir === 'row' ? 'HORIZONTAL' : 'VERTICAL';
  node.itemSpacing = o.gap === undefined ? 0 : o.gap;
  node.paddingTop = o.pt === undefined ? (o.pad || 0) : o.pt;
  node.paddingBottom = o.pb === undefined ? (o.pad || 0) : o.pb;
  node.paddingLeft = o.pl === undefined ? (o.pad || 0) : o.pl;
  node.paddingRight = o.pr === undefined ? (o.pad || 0) : o.pr;
  node.primaryAxisSizingMode = o.grow ? 'FIXED' : 'AUTO';
  node.counterAxisSizingMode = o.wide ? 'FIXED' : 'AUTO';
  node.cornerRadius = o.radius === undefined ? 0 : o.radius;
  node.fills = o.bg ? fill(o.bg) : [];
  node.clipsContent = o.clip !== false;

  if (o.wide) node.resize(o.wide, node.height);
  if (o.grow) node.resize(node.width, o.grow);
  if (o.align) node.counterAxisAlignItems = o.align;
  if (o.justify) node.primaryAxisAlignItems = o.justify;

  if (o.stroke) {
    node.strokes = fill(o.stroke);
    node.strokeWeight = o.strokeWeight === undefined ? 1 : o.strokeWeight;
  }

  return node;
}

async function text(chars, options) {
  const o = options || {};
  const family = o.mono ? MONO : SANS;
  const style = o.style || 'Regular';

  await figma.loadFontAsync({ family: family, style: style });

  const node = figma.createText();

  node.fontName = { family: family, style: style };
  node.characters = chars;
  node.fontSize = o.size === undefined ? 14 : o.size;
  node.fills = fill(o.colour || C.paper);
  node.name = chars.length > 28 ? chars.slice(0, 28) + '…' : chars;

  if (o.tracking !== undefined) node.letterSpacing = { unit: 'PERCENT', value: o.tracking };
  if (o.lineHeight !== undefined) node.lineHeight = { unit: 'PERCENT', value: o.lineHeight };
  if (o.width) {
    node.textAutoResize = 'HEIGHT';
    node.resize(o.width, node.height);
  }

  return node;
}

/** Служебная подпись: моно, разрежённая, капсом. Повторяется везде. */
const label = (chars, colour) =>
  text(chars.toUpperCase(), { mono: true, size: 10, tracking: 14, colour: colour || C.faint });

function add(parent, children) {
  for (const child of children) parent.appendChild(child);

  return parent;
}

/** Растягивает узел по ширине родителя — авто-лэйаут этого сам не делает. */
function stretch(node) {
  node.layoutAlign = 'STRETCH';

  return node;
}

/* ── стили файла ───────────────────────────────────────────────────────── */

async function buildStyles() {
  const wanted = [
    ['Ночь', C.night], ['Стол', C.table], ['Приподнято', C.raised],
    ['Кромка', C.edge], ['Бумага', C.paper], ['Бумага тусклая', C.dim],
    ['Бумага бледная', C.faint], ['Латунь', C.brass], ['Латунь светлая', C.brassLit],
    ['Пришло', C.money], ['Удержали', C.taken],
  ];

  for (const [name, hex] of wanted) {
    const style = figma.createPaintStyle();

    style.name = PREFIX + 'Цвет/' + name;
    style.paints = fill(hex);
  }

  const type = [
    ['Деньги/Крупно', SANS, 'Extra Bold', 64, -5],
    ['Деньги/Средне', SANS, 'Bold', 28, -2],
    ['Заголовок', SANS, 'Bold', 22, -2],
    ['Текст', SANS, 'Regular', 15, 0],
    ['Текст тусклый', SANS, 'Regular', 14, 0],
    ['Служебное', MONO, 'Regular', 10, 14],
    ['Чек', MONO, 'Regular', 13, 0],
  ];

  for (const [name, family, style, size, tracking] of type) {
    await figma.loadFontAsync({ family: family, style: style });

    const made = figma.createTextStyle();

    made.name = PREFIX + 'Текст/' + name;
    made.fontName = { family: family, style: style };
    made.fontSize = size;
    made.letterSpacing = { unit: 'PERCENT', value: tracking };
  }
}

/* ── экраны ────────────────────────────────────────────────────────────── */

async function foundations() {
  const page = box('Основа', { pad: 48, gap: 36, bg: C.night, wide: 1160 });

  page.appendChild(await text('Основа', { size: 40, style: 'Extra Bold', tracking: -3 }));

  const swatches = box('Цвета', { dir: 'row', gap: 10 });
  const named = [
    ['Ночь', C.night], ['Стол', C.table], ['Латунь', C.brass],
    ['Пришло', C.money], ['Удержали', C.taken], ['Бумага', C.paper],
  ];

  for (const [name, hex] of named) {
    const chip = box(name, { wide: 160, gap: 0, radius: 10, stroke: C.edge, clip: true });
    const swatch = box('Пятно', { wide: 160, grow: 64, bg: hex });

    chip.appendChild(swatch);

    const meta = box('Подпись', { pad: 11, gap: 2, wide: 160 });

    meta.appendChild(await text(name, { size: 13 }));
    meta.appendChild(await text(hex, { mono: true, size: 10, colour: C.faint }));
    chip.appendChild(meta);
    swatches.appendChild(chip);
  }

  page.appendChild(swatches);

  const scale = box('Шкала', { gap: 10 });

  scale.appendChild(await label('Деньги · 800 · табличные'));
  scale.appendChild(await text('₴24 700', { size: 46, style: 'Extra Bold', tracking: -4 }));
  scale.appendChild(await label('Заголовок · 700'));
  scale.appendChild(await text('Понедельник, 31 августа', { size: 22, style: 'Bold', tracking: -2 }));
  scale.appendChild(await label('Текст · 400'));
  scale.appendChild(await text('Осталось ₴10 100 за 7 дней', { size: 15, colour: C.dim }));
  scale.appendChild(await label('Служебное · моно · 0.14em'));
  scale.appendChild(await text('17:00–01:00 · 8 Ч · БАР', { mono: true, size: 11, tracking: 14, colour: C.faint }));

  page.appendChild(scale);

  return page;
}

async function calendarScreen() {
  const screen = box('Экран — календарь', { wide: 1160, gap: 0, bg: C.night, radius: 20, stroke: C.edge });

  /* шапка */
  const bar = box('Шапка', { dir: 'row', gap: 22, pl: 26, pr: 26, grow: 62, wide: 1160, align: 'CENTER' });

  bar.appendChild(await text('Shifter.', { size: 17, style: 'Extra Bold', tracking: -4 }));

  const tabs = box('Вкладки', { dir: 'row', gap: 4 });
  const names = ['Календарь', 'Смены', 'Выплаты', 'Банк', 'Год'];

  for (let i = 0; i < names.length; i += 1) {
    const on = i === 0;
    const tab = box(names[i], { pl: 13, pr: 13, pt: 7, pb: 7, radius: 8, bg: on ? C.brass : undefined });

    tab.appendChild(await text(names[i], {
      size: 13,
      colour: on ? C.night : C.faint,
      style: on ? 'Semi Bold' : 'Regular',
    }));
    tabs.appendChild(tab);
  }

  bar.appendChild(tabs);

  const live = box('Живая смена', { dir: 'row', gap: 8, align: 'CENTER' });
  const dot = figma.createEllipse();

  dot.resize(7, 7);
  dot.fills = fill(C.brass);
  dot.name = 'Идёт';
  live.appendChild(dot);
  live.appendChild(await text('3:07:42 · ₴1 640', { mono: true, size: 12, colour: C.brassLit }));
  bar.appendChild(live);
  bar.primaryAxisAlignItems = 'SPACE_BETWEEN';

  screen.appendChild(bar);

  /* заработано */
  const takings = box('Заработано', { pl: 26, pr: 26, pt: 40, pb: 30, gap: 10, wide: 1160 });

  takings.appendChild(await label('Август · заработано'));
  takings.appendChild(await text('₴24 700', { size: 76, style: 'Extra Bold', tracking: -5 }));

  const under = box('Под цифрой', { dir: 'row', gap: 22 });

  under.appendChild(await text('11 смен', { size: 15, colour: C.dim }));
  under.appendChild(await text('83 часа', { size: 15, colour: C.dim }));
  under.appendChild(await text('час стоил ₴299', { size: 15, colour: C.dim }));
  under.appendChild(await text('чаевые ₴7 700', { size: 15, colour: C.dim }));
  takings.appendChild(under);
  screen.appendChild(takings);

  /* сетка */
  const weeks = box('Недели', { pl: 18, pr: 18, pb: 26, gap: 10, wide: 1160 });
  const dow = box('Дни недели', { dir: 'row', gap: 8, pl: 8, pr: 8 });

  for (const name of ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']) {
    const cell = box(name, { wide: 152 });

    cell.appendChild(await text(name, { mono: true, size: 10, tracking: 14, colour: C.faint }));
    dow.appendChild(cell);
  }

  weeks.appendChild(dow);

  const rows = [
    [['18'], ['19'], ['20', 'Вечер', '2 200'], ['21', 'Вечер', '2 200'], ['22', 'Вечер', '2 470'], ['23', 'День', '1 340'], ['24']],
    [['25'], ['26'], ['27', 'Вечер', '2 200'], ['28', 'Вечер', '2 340'], ['29', 'Вечер', '2 470'], ['30', 'День', '1 310'], ['31', 'Вечер', '1 640', true]],
  ];

  for (const week of rows) {
    const line = box('Неделя', { dir: 'row', gap: 8 });

    for (const [n, what, amount, today] of week) {
      const empty = what === undefined;
      const cell = box('День ' + n, {
        wide: 152,
        grow: 108,
        pad: 12,
        gap: 7,
        radius: 12,
        bg: empty ? undefined : C.deep,
        stroke: today ? C.brass : undefined,
      });

      cell.appendChild(await text(n, {
        mono: true,
        size: 12,
        colour: today ? C.brass : (empty ? C.faintEdge : C.dim),
      }));

      if (!empty) {
        const tag = box('Смена', { dir: 'row', gap: 6, align: 'CENTER' });
        const mark = figma.createRectangle();

        mark.resize(3, 14);
        mark.cornerRadius = 2;
        mark.fills = fill(C.brass);
        mark.name = 'Метка';
        tag.appendChild(mark);
        tag.appendChild(await text(what, { size: 12, colour: C.dim }));
        cell.appendChild(tag);

        const money = await text(amount, { mono: true, size: 13, colour: C.money });

        cell.appendChild(money);
        cell.primaryAxisAlignItems = 'SPACE_BETWEEN';
      }

      line.appendChild(cell);
    }

    weeks.appendChild(line);
  }

  screen.appendChild(weeks);

  return screen;
}

async function docket() {
  const card = box('День — чек', { wide: 380, pad: 22, gap: 0, radius: 16, bg: C.deep, stroke: C.edge });

  const head = box('Шапка чека', { dir: 'row', wide: 336, justify: 'SPACE_BETWEEN', align: 'BASELINE' });

  head.appendChild(await text('ПН 31 АВГУСТА', { mono: true, size: 11, tracking: 4, colour: C.dim }));
  head.appendChild(await text('₴1 640', { size: 24, style: 'Bold', colour: C.money, tracking: -2 }));
  card.appendChild(head);

  const tear = async () => {
    const line = figma.createRectangle();

    line.resize(336, 1);
    line.fills = fill(C.faintEdge);
    line.name = 'Линия отрыва';
    line.opacity = 0.55;

    const spacer = box('Отступ', { wide: 336, grow: 32, justify: 'CENTER' });

    spacer.appendChild(line);

    return spacer;
  };

  const line = async (what, value, options) => {
    const o = options || {};
    const row = box(what, { dir: 'row', wide: 336, grow: 24, justify: 'SPACE_BETWEEN', align: 'CENTER' });

    row.appendChild(await text(what, { mono: true, size: o.small ? 11 : 13, colour: o.small ? C.faint : C.dim }));
    row.appendChild(await text(value, {
      mono: true,
      size: o.small ? 11 : 13,
      colour: o.take ? C.taken : (o.small ? C.faint : C.paper),
    }));

    return row;
  };

  card.appendChild(await tear());
  card.appendChild(await line('Вечер · бар', '17:00–01:00'));
  card.appendChild(await line('по факту', '17:12–01:40', { small: true }));
  card.appendChild(await line('перерыв', '30 мин', { small: true }));
  card.appendChild(await line('8,0 ч × ₴200', '1 600'));
  card.appendChild(await tear());
  card.appendChild(await line('Чаевые', '400'));
  card.appendChild(await line('из них наличными', '150', { small: true }));
  card.appendChild(await line('Питание', '−90', { take: true }));
  card.appendChild(await line('В котёл, 5%', '−20', { take: true }));
  card.appendChild(await tear());

  const sum = box('Итого', { dir: 'row', wide: 336, justify: 'SPACE_BETWEEN', align: 'CENTER' });

  sum.appendChild(await text('ИТОГО', { mono: true, size: 13, style: 'Medium' }));
  sum.appendChild(await text('₴1 890', { mono: true, size: 14, style: 'Medium', colour: C.money }));
  card.appendChild(sum);

  return card;
}

async function modal() {
  const sheet = box('Модалка — новая смена', { wide: 430, pad: 24, gap: 14, radius: 18, bg: C.table, stroke: C.faintEdge });

  sheet.appendChild(await text('Новая смена', { size: 20, style: 'Bold', tracking: -2 }));
  sheet.appendChild(await text('Шаблон помнит часы и ставку — дальше смена ставится одним нажатием.', {
    size: 13,
    colour: C.dim,
    width: 382,
  }));

  const field = async (name, value, width) => {
    const wrap = box(name, { gap: 7, wide: width || 382 });

    wrap.appendChild(await label(name));

    const input = box('Поле', { wide: width || 382, grow: 42, pl: 13, pr: 13, radius: 10, bg: C.night, stroke: C.faintEdge, justify: 'CENTER' });

    input.appendChild(await text(value, { mono: true, size: 14 }));
    wrap.appendChild(input);

    return wrap;
  };

  sheet.appendChild(await field('Название', 'Вечер, бар'));

  const pair = box('Часы', { dir: 'row', gap: 10 });

  pair.appendChild(await field('Начало', '17:00', 186));
  pair.appendChild(await field('Конец', '01:00', 186));
  sheet.appendChild(pair);

  const pays = box('Платят', { gap: 7 });

  pays.appendChild(await label('Платят'));

  const pills = box('Варианты', { dir: 'row', gap: 7 });

  const options = ['в час', 'в день', 'в неделю', 'в месяц'];

  for (let i = 0; i < options.length; i += 1) {
    const on = i === 0;
    const pill = box(options[i], {
      pl: 13, pr: 13, pt: 6, pb: 6,
      radius: 999,
      bg: on ? C.brass : undefined,
      stroke: on ? undefined : C.faintEdge,
    });

    pill.appendChild(await text(options[i], {
      size: 12,
      colour: on ? C.night : C.dim,
      style: on ? 'Semi Bold' : 'Regular',
    }));
    pills.appendChild(pill);
  }

  pays.appendChild(pills);
  sheet.appendChild(pays);
  sheet.appendChild(await field('Ставка', '200'));

  const actions = box('Кнопки', { dir: 'row', gap: 10, wide: 382 });

  const button = async (name, primary) => {
    const node = box(name, {
      wide: 186, grow: 42, radius: 10,
      bg: primary ? C.brass : undefined,
      stroke: primary ? undefined : C.faintEdge,
      justify: 'CENTER', align: 'CENTER',
    });

    node.appendChild(await text(name, {
      size: 14,
      style: 'Semi Bold',
      colour: primary ? C.night : C.dim,
    }));

    return node;
  };

  actions.appendChild(await button('Отмена', false));
  actions.appendChild(await button('Сохранить', true));
  sheet.appendChild(actions);

  return sheet;
}

/* ── сборка ────────────────────────────────────────────────────────────── */

async function main() {
  await figma.loadAllPagesAsync();

  /* Второй прогон не должен класть копию поверх первой. */
  for (const node of figma.currentPage.children) {
    if (node.name.indexOf(PREFIX) === 0) node.remove();
  }

  for (const style of await figma.getLocalPaintStylesAsync()) {
    if (style.name.indexOf(PREFIX) === 0) style.remove();
  }

  for (const style of await figma.getLocalTextStylesAsync()) {
    if (style.name.indexOf(PREFIX) === 0) style.remove();
  }

  await buildStyles();

  const sheet = box(PREFIX + 'Направление «Ночная смена»', {
    pad: 64,
    gap: 56,
    bg: C.night,
  });

  sheet.appendChild(await text('Ночная смена', { size: 56, style: 'Extra Bold', tracking: -4 }));
  sheet.appendChild(await text(
    'Приложением пользуются в два часа ночи, после закрытия, с телефона в подсобке. Отсюда тёплая темнота, один латунный акцент и чек с раздачи как опорный объект.',
    { size: 16, colour: C.dim, width: 720 },
  ));

  sheet.appendChild(await foundations());
  sheet.appendChild(await calendarScreen());

  const pairRow = box('День и модалка', { dir: 'row', gap: 40, align: 'MIN' });

  pairRow.appendChild(await docket());
  pairRow.appendChild(await modal());
  sheet.appendChild(pairRow);

  figma.currentPage.appendChild(sheet);
  sheet.x = 0;
  sheet.y = 0;

  figma.viewport.scrollAndZoomIntoView([sheet]);
  figma.closePlugin('Готово: основа, календарь, чек дня и модалка.');
}

main().catch((error) => {
  figma.closePlugin('Не собралось: ' + error.message);
});
