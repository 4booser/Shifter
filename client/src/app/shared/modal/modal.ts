import {
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Wraps the native dialog element, which brings the backdrop, Escape handling,
 * focus trapping and inertness of the page behind it for free.
 */
@Component({
  selector: 'app-modal',
  templateUrl: './modal.html',
})
export class Modal {
  readonly open = input.required<boolean>();
  readonly title = input('');
  /** Charts need width a form never does. */
  readonly wide = input(false);
  readonly closed = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;

      if (element === undefined) return;

      // showModal on an already-open dialog throws, hence the guards.
      if (this.open() && !element.open) element.showModal();
      if (!this.open() && element.open) element.close();
    });
  }

  /** Escape and the close button both land here through the dialog's event. */
  protected onClose(): void {
    this.closed.emit();
  }

  /**
   * The backdrop is painted by the dialog itself, so a click on it reports the
   * dialog as the target. Anything inside the card stops short of this.
   */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.closed.emit();
  }
}
