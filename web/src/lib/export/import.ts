/**
 * Reading a spreadsheet back in. The export side hand-rolls XLSX, so the
 * import side does too — a parser for the two formats people actually have is
 * a couple of hundred lines, and it keeps the dependency list at zero.
 */

export interface ImportRow {
  /** 1-based, as the person sees it in their spreadsheet. */
  line: number;
  date: string;
  shift: string | null;
  tips: number | null;
  tipsCash: number | null;
  deductions: number | null;
  note: string | null;
  /** Filled when the row cannot be used; the row is then shown but not sent. */
  problem: string | null;
}

export interface ImportPreview {
  rows: ImportRow[];
  /** Column headings as they were found, for the "did we read this right" check. */
  headers: string[];
  usable: number;
  skipped: number;
}

/** Heading spellings that mean the same column, in all three languages. */
const COLUMNS: Record<string, string[]> = {
  date: ['date', 'день', 'дата', 'day'],
  shift: ['shift', 'смена', 'зміна', 'template', 'шаблон'],
  tips: ['tips', 'чай', 'чаевые', 'чайові'],
  tipsCash: ['cash', 'наличные', 'готівка', 'tips cash', 'чай наличными'],
  deductions: ['deductions', 'удержания', 'утримання', 'штраф', 'fines'],
  note: ['note', 'заметка', 'нотатка', 'комментарий', 'comment'],
};

export async function readSpreadsheet(file: File): Promise<ImportPreview> {
  const name = file.name.toLowerCase();

  const table = name.endsWith('.xlsx')
    ? await readXlsx(file)
    : parseCsv(await file.text());

  return toPreview(table);
}

// ==== CSV ====

/**
 * Splits on the delimiter the file actually uses and honours quoting, so a
 * note containing a comma does not become two columns.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const delimiter = pickDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted value is one literal quote.
        if (clean[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char !== '\r') {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

/** Whichever separator appears most on the first line wins. */
function pickDelimiter(text: string): string {
  const first = text.slice(0, text.indexOf('\n') + 1 || undefined);
  const counts = [',', ';', '\t'].map((sign) => ({
    sign,
    count: first.split(sign).length - 1,
  }));

  return counts.sort((a, b) => b.count - a.count)[0].count > 0
    ? counts.sort((a, b) => b.count - a.count)[0].sign
    : ',';
}

// ==== XLSX ====

/**
 * An xlsx is a zip of XML. Only two members are needed: the shared string
 * table and the first worksheet. Inflating uses DecompressionStream, which
 * every browser this app targets now has, so no inflate implementation here.
 */
async function readXlsx(file: File): Promise<string[][]> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = await unzip(buffer);

  const sheetName = Object.keys(entries).find((key) =>
    key.startsWith('xl/worksheets/sheet'),
  );

  if (sheetName === undefined) throw new Error('No worksheet inside the file.');

  const shared = entries['xl/sharedStrings.xml'];
  const strings = shared === undefined ? [] : parseSharedStrings(decode(shared));

  return parseSheet(decode(entries[sheetName]), strings);
}

/** Reads the local file headers; enough for the small archives Excel writes. */
async function unzip(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const files: Record<string, Uint8Array> = {};

  let offset = 0;

  while (offset + 4 <= data.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;

    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const uncompressed = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    const nameStart = offset + 30;
    const name = decode(data.subarray(nameStart, nameStart + nameLength));
    const bodyStart = nameStart + nameLength + extraLength;
    const body = data.subarray(bodyStart, bodyStart + compressed);

    if (method === 0) {
      files[name] = body;
    } else if (method === 8) {
      files[name] = await inflateRaw(body);
    }

    // A streamed archive puts the sizes after the body; those are not the
    // files this reads, and stopping is better than misreading them.
    if (compressed === 0 && uncompressed === 0 && method !== 0) break;

    offset = bodyStart + compressed;
  }

  return files;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decode(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    // A cell's text can be split across runs; the concatenation is the value.
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((run) => unescapeXml(run[1]))
      .join(''),
  );
}

function parseSheet(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = /r="([A-Z]+)\d+"/.exec(attributes)?.[1];
      const column = reference === undefined ? cells.length : columnIndex(reference);

      // Blank cells are omitted from the XML, so gaps have to be filled or
      // every column after one lands a place to the left.
      while (cells.length < column) cells.push('');

      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];

      if (inline !== undefined) {
        cells.push(unescapeXml(inline));
      } else if (/t="s"/.test(attributes)) {
        cells.push(strings[Number(value)] ?? '');
      } else {
        cells.push(unescapeXml(value));
      }
    }

    rows.push(cells);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function columnIndex(reference: string): number {
  let index = 0;

  for (const char of reference) index = index * 26 + (char.charCodeAt(0) - 64);

  return index - 1;
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ==== Shaping ====

function toPreview(table: string[][]): ImportPreview {
  if (table.length === 0) {
    return { rows: [], headers: [], usable: 0, skipped: 0 };
  }

  const headers = table[0].map((cell) => cell.trim());
  const map = mapColumns(headers);

  if (map['date'] === undefined) {
    throw new Error('No date column found. Name one of them "date" or "дата".');
  }

  const rows = table.slice(1).map((cells, index) => {
    const at = (key: keyof typeof map): string => {
      const column = map[key];

      return column === undefined ? '' : (cells[column] ?? '').trim();
    };

    const date = normaliseDate(at('date'));

    return {
      line: index + 2,
      date: date ?? at('date'),
      shift: at('shift') || null,
      tips: toNumber(at('tips')),
      tipsCash: toNumber(at('tipsCash')),
      deductions: toNumber(at('deductions')),
      note: at('note') || null,
      problem: date === null ? 'Date is not readable.' : null,
    } satisfies ImportRow;
  });

  return {
    rows,
    headers,
    usable: rows.filter((row) => row.problem === null).length,
    skipped: rows.filter((row) => row.problem !== null).length,
  };
}

function mapColumns(headers: string[]): Partial<Record<keyof typeof COLUMNS, number>> {
  const found: Partial<Record<keyof typeof COLUMNS, number>> = {};

  headers.forEach((heading, index) => {
    const lower = heading.toLowerCase();

    for (const [key, spellings] of Object.entries(COLUMNS)) {
      const column = key as keyof typeof COLUMNS;

      if (found[column] !== undefined) continue;
      if (spellings.some((word) => lower === word || lower.includes(word))) {
        found[column] = index;
      }
    }
  });

  return found;
}

/** Accepts the three orderings people's spreadsheets actually contain. */
export function normaliseDate(value: string): string | null {
  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);

  if (parts !== null) {
    const [, day, month, year] = parts;

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Excel keeps dates as days since 1899-12-30.
  if (/^\d{5}$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000);

    return date.toISOString().slice(0, 10);
  }

  return null;
}

/** Tolerates a comma decimal separator and spaces used as thousands marks. */
export function toNumber(value: string): number | null {
  if (value.trim().length === 0) return null;

  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : null;
}
