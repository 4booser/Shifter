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
  | 'sliders';

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
  sliders: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', 'M16 5v4', 'M10 15v4'],
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
