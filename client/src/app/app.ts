import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { TPipe } from './core/i18n/i18n';
import { OfflineQueue } from './core/offline/offline-queue';
import { ServiceWorkerHost } from './core/offline/sw-register';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly worker = inject(ServiceWorkerHost);
  protected readonly queue = inject(OfflineQueue);

  protected readonly updateReady = this.worker.updateReady;

  constructor() {
    this.worker.register();
  }

  protected applyUpdate(): void {
    this.worker.applyUpdate();
  }

  protected retry(): void {
    void this.queue.flush();
  }
}
