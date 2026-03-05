import {AppModule} from '../AppModule.js';
import electronUpdater, {type AppUpdater, type Logger} from 'electron-updater';
import type {ModuleContext} from '../ModuleContext.js';

type DownloadNotification = Parameters<AppUpdater['checkForUpdatesAndNotify']>[0];
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export class AutoUpdater implements AppModule {

  readonly #logger: Logger | null;
  readonly #notification: DownloadNotification;
  readonly #checkIntervalMs: number;
  #isDebugListenersRegistered = false;

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

  registerDebugListeners(updater: AppUpdater) {
    if (this.#isDebugListenersRegistered) {
      return;
    }

    updater.on('checking-for-update', () => {
      console.debug('[auto-updater] checking for update');
    });

    updater.on('update-available', (info) => {
      console.info('[auto-updater] update available', {
        version: info?.version,
        releaseDate: info?.releaseDate,
      });
    });

    updater.on('update-not-available', (info) => {
      console.debug('[auto-updater] no update available', {
        version: info?.version,
      });
    });

    updater.on('download-progress', (progress) => {
      console.debug('[auto-updater] download progress', {
        percent: progress?.percent,
        bytesPerSecond: progress?.bytesPerSecond,
        transferred: progress?.transferred,
        total: progress?.total,
      });
    });

    updater.on('update-downloaded', (event) => {
      console.info('[auto-updater] update downloaded', {
        version: event?.version,
        releaseName: event?.releaseName,
      });
    });

    updater.on('error', (error) => {
      console.error('[auto-updater] updater error', error);
    });

    this.#isDebugListenersRegistered = true;
  }

  async runAutoUpdater() {
    const updater = this.getAutoUpdater();
    try {
      updater.logger = this.#logger || console;
      updater.fullChangelog = true;
      this.registerDebugListeners(updater);

      if (import.meta.env.VITE_DISTRIBUTION_CHANNEL) {
        updater.channel = import.meta.env.VITE_DISTRIBUTION_CHANNEL;
      }

      console.debug('[auto-updater] starting update check', {
        channel: updater.channel,
      });

      const result = await updater.checkForUpdatesAndNotify(this.#notification);
      console.debug('[auto-updater] update check completed', {
        version: result?.updateInfo?.version,
      });

      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('No published versions')) {
          console.debug('[auto-updater] no published versions available');
          return null;
        }
      }

      console.error('[auto-updater] update check failed', error);

      throw error;
    }
  }
}


export function autoUpdater(...args: ConstructorParameters<typeof AutoUpdater>) {
  return new AutoUpdater(...args);
}
