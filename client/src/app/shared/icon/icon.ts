import { Component, computed, input } from '@angular/core';

export type IconName =
  | 'plus'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'calendar'
  | 'clock'
  | 'coins'
  | 'note'
  | 'bag'
  | 'repeat'
  | 'brush'
  | 'logout'
  | 'check'
  | 'wallet'
  | 'sliders'
  | 'chart'
  | 'eye'
  | 'eye-off'
  | 'trash'
  | 'flame'
  | 'trophy'
  | 'arrow-up'
  | 'arrow-down'
  | 'spark'
  | 'target'
  | 'moon'
  | 'sunrise';

/**
 * Inline SVG rather than an icon font or a package: no extra request, no
 * flash of missing glyphs, and the stroke follows currentColor so an icon
 * always matches the text beside it.
 */
const PATHS: Record<IconName, string[]> = {
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  'chevron-left': ['M14.5 6l-6 6 6 6'],
  'chevron-right': ['M9.5 6l6 6-6 6'],
  calendar: ['M8 3v4', 'M16 3v4', 'M3.5 9.5h17', 'M5 5.5h14v14H5z'],
  clock: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7.5V12l3 2'],
  coins: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7v10', 'M14.5 9.5h-3.75a1.75 1.75 0 000 3.5h2.5a1.75 1.75 0 010 3.5H9.5'],
  note: ['M14 3.5H6v17h12V7.5z', 'M13.5 3.5V8h4.5', 'M9 13h6', 'M9 16.5h4'],
  bag: ['M6 8h12l-1.1 12.5H7.1z', 'M9 8V6.5a3 3 0 016 0V8'],
  repeat: ['M4 8.5h11.5a3.5 3.5 0 013.5 3.5', 'M7 5.5l-3 3 3 3', 'M20 15.5H8.5A3.5 3.5 0 015 12', 'M17 18.5l3-3-3-3'],
  brush: ['M4.5 19.5l3.2-.8 8.8-8.8-2.4-2.4-8.8 8.8z', 'M14.5 5.5l4 4', 'M4.5 19.5l1.6-1.6'],
  logout: ['M10.5 4.5H6.5a1.5 1.5 0 00-1.5 1.5v12a1.5 1.5 0 001.5 1.5h4', 'M16 8.5l3.5 3.5-3.5 3.5', 'M19.5 12h-9'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  trash: ['M5 7h14', 'M9.5 7V5h5v2', 'M7 7l.9 12.5h8.2L17 7', 'M11 10.5v6', 'M13 10.5v6'],
  flame: ['M12 3s5 4.2 5 9a5 5 0 01-10 0c0-2 1-3.5 2-4.5 0 1.6 1 2.5 2 2.5s1.6-1 1.6-2.5c0-2-.6-3.6-.6-4.5z'],
  trophy: ['M7 4.5h10v4a5 5 0 01-10 0z', 'M7 6H4.5v1A3.5 3.5 0 007.5 10.5', 'M17 6h2.5v1a3.5 3.5 0 01-3 3.5', 'M12 13.5v4', 'M8.5 19.5h7'],
  eye: ['M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z', 'M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z'],
  'eye-off': ['M4 5l16 14', 'M9.5 6.6A9.8 9.8 0 0112 6c5.5 0 9 6 9 6a16.5 16.5 0 01-3.2 3.6', 'M6.3 8.4A16.4 16.4 0 003 12s3.5 6 9 6a9.5 9.5 0 003.4-.6'],
  chart: ['M4 20V11', 'M10 20V5', 'M16 20v-6', 'M20 20H4'],
  sliders: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', 'M16 5v4', 'M10 15v4'],
  'arrow-up': ['M12 19V6', 'M6.5 11.5L12 6l5.5 5.5'],
  'arrow-down': ['M12 5v13', 'M6.5 12.5L12 18l5.5-5.5'],
  spark: ['M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z', 'M18 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  target: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 11.5a.5.5 0 100 1 .5.5 0 000-1z'],
  moon: ['M20 13.5A8 8 0 019.2 4.3 8.5 8.5 0 1020 13.5z'],
  sunrise: ['M12 4v5', 'M8.5 9.5L12 6l3.5 3.5', 'M3.5 16h17', 'M6 20h12'],
  wallet: ['M4 7.5h13a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z', 'M4 7.5A2 2 0 016 5.5h9', 'M16.5 13.5h2'],
};

@Component({
  selector: 'app-icon',
  template: `
    <svg
      class="icon"
      [style.width.px]="size()"
      [style.height.px]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (path of paths(); track $index) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(16);

  protected readonly paths = computed(() => PATHS[this.name()] ?? []);
}
