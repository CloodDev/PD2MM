import {AppModule} from '../AppModule.js';
import electronUpdater, {type AppUpdater, type Logger} from 'electron-updater';
import type {ModuleContext} from '../ModuleContext.js';

type DownloadNotification = Parameters<AppUpdater['checkForUpdatesAndNotify']>[0];
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export class AutoUpdater implements AppModule {

  readonly #logger: Logger | null;
  readonly #notification: DownloadNotification;
  readonly #checkIntervalMs: number;

  constructor(
    {
      logger = null,
      downloadNotification = undefined,
      checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    }:
      {
        logger?: Logger | null | undefined,
        downloadNotification?: DownloadNotification,
        checkIntervalMs?: number
      } = {},
  ) {
    this.#logger = logger;
    this.#notification = downloadNotification;
    this.#checkIntervalMs = checkIntervalMs;
  }

  async enable({app}: ModuleContext): Promise<void> {
    if (!app.isPackaged) {
      return;
    }

    await app.whenReady();
    await this.runAutoUpdater();

    const timer = setInterval(() => {
      this.runAutoUpdater().catch((error) => {
        console.error('Failed to check for updates', error);
      });
    }, this.#checkIntervalMs);

    timer.unref?.();
  }

  getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const {autoUpdater} = electronUpdater;
    return autoUpdater;
  }

  async runAutoUpdater() {
    const updater = this.getAutoUpdater();
    try {
      updater.logger = this.#logger || null;
      updater.fullChangelog = true;

      if (import.meta.env.VITE_DISTRIBUTION_CHANNEL) {
        updater.channel = import.meta.env.VITE_DISTRIBUTION_CHANNEL;
      }

      return await updater.checkForUpdatesAndNotify(this.#notification);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('No published versions')) {
          return null;
        }
      }

      throw error;
    }
  }
}


export function autoUpdater(...args: ConstructorParameters<typeof AutoUpdater>) {
  return new AutoUpdater(...args);
}
