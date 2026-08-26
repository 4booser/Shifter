import { CardTheme } from './share-card';

export interface RotaCardRow {
  name: string;
  colour: string;
  /** One list per day column: already-formatted "Bar 11:00–19:00" lines. */
  cells: string[][];
}

export interface RotaCardData {
  teamName: string;
  period: string;
  /** Column headers, Monday first: "пн 24". */
  dayLabels: string[];
  rows: RotaCardRow[];
  totalLabel: string;
}

const W = 1200;
const PAD = 56;
const NAME_W = 200;
const HEADER_H = 128;
const DAY_H = 40;
const ROW_H = 64;
const FOOTER_H = 64;

/**
 * The week as one PNG, sized for a group chat. Painted on canvas for the same
 * reason the stats card is: a DOM screenshot loses its CSS variables, a canvas
 * is pixel-stable everywhere, including the dark theme it inherits.
 */
export function drawRotaCard(data: RotaCardData, theme: CardTheme): Promise<Blob> {
  const height = HEADER_H + DAY_H + data.rows.length * ROW_H + FOOTER_H;
  const canvas = document.createElement('canvas');
  const scale = 2;

  canvas.width = W * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');

  if (ctx === null) return Promise.reject(new Error('canvas'));

  ctx.scale(scale, scale);

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, W, height);

  // Header: the crew's name carries the card; the period sits quietly right.
  ctx.fillStyle = theme.text;
  ctx.font = '700 30px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(data.teamName, PAD, 76);

  ctx.fillStyle = theme.muted;
  ctx.font = '500 19px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(data.period, W - PAD, 76);
  ctx.textAlign = 'left';

  const colW = (W - PAD * 2 - NAME_W) / 7;
  const gridX = PAD + NAME_W;
  const gridY = HEADER_H;

  // Day headers.
  ctx.fillStyle = theme.faint;
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  data.dayLabels.forEach((label, index) => {
    ctx.fillText(label.toUpperCase(), gridX + colW * (index + 0.5), gridY + 24);
  });
  ctx.textAlign = 'left';

  // Grid lines: rows only. Vertical rules would fight the text at this size.
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  data.rows.forEach((_, index) => {
    const y = gridY + DAY_H + index * ROW_H;

    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(W - PAD, y + 0.5);
    ctx.stroke();
  });

  const clip = (text: string, max: number, font: string) => {
    ctx.font = font;

    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
  };

  data.rows.forEach((row, rowIndex) => {
    const y = gridY + DAY_H + rowIndex * ROW_H;

    ctx.fillStyle = row.colour;
    ctx.beginPath();
    ctx.arc(PAD + 7, y + ROW_H / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.text;
    const nameFont = '600 17px system-ui, -apple-system, sans-serif';

    ctx.font = nameFont;
    ctx.fillText(clip(row.name, NAME_W - 36, nameFont), PAD + 22, y + ROW_H / 2 + 6);

    row.cells.forEach((cell, dayIndex) => {
      const cx = gridX + colW * dayIndex + 8;
      const maxW = colW - 16;

      if (cell.length === 0) {
        ctx.fillStyle = theme.faint;
        ctx.font = '400 15px system-ui, -apple-system, sans-serif';
        ctx.fillText('·', cx + maxW / 2 - 2, y + ROW_H / 2 + 5);

        return;
      }

      // Two lines fit; a third becomes "+N" so nothing silently vanishes.
      const shown = cell.slice(0, 2);
      const extra = cell.length - shown.length;

      shown.forEach((line, lineIndex) => {
        const font = `${lineIndex === 0 ? 600 : 500} 13px system-ui, -apple-system, sans-serif`;

        ctx.fillStyle = lineIndex === 0 ? theme.text : theme.muted;
        ctx.fillText(clip(extra > 0 && lineIndex === 1 ? `+${extra + 1}` : line, maxW, font), cx, y + 26 + lineIndex * 20);
      });
    });
  });

  ctx.fillStyle = theme.muted;
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.totalLabel, PAD, height - 26);

  ctx.fillStyle = theme.accent;
  ctx.font = '700 15px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Shifter', W - PAD, height - 26);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('png')) : resolve(blob)),
      'image/png',
    );
  });
}
