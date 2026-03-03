import {AppModule} from '../AppModule.js';
import {ModuleContext} from '../ModuleContext.js';
import {shell} from 'electron';
import {URL} from 'node:url';

export class ExternalUrls implements AppModule {

  readonly #externalUrls: Set<string>;

  constructor(externalUrls: Set<string>) {
    this.#externalUrls = externalUrls;
  }

  enable({app}: ModuleContext): Promise<void> | void {
    app.on('web-contents-created', (_, contents) => {
      // Handle window.open() calls
      contents.setWindowOpenHandler(({url}) => {
        // Don't open our own protocol URLs externally
        if (url.startsWith('mws-pdmm://')) {
          console.log('Intercepted internal protocol URL, not opening externally:', url);
          return {action: 'deny'};
        }

        const {origin} = new URL(url);

        if (this.#externalUrls.has(origin)) {
          shell.openExternal(url).catch(console.error);
        } else if (import.meta.env.DEV) {
          console.warn(`Blocked the opening of a disallowed external origin: ${origin}`);
        }

        // Prevent creating a new window.
        return {action: 'deny'};
      });

      // Handle navigation events (like clicking links)
      contents.on('will-navigate', (event, url) => {
        // Don't allow navigation to protocol URLs - they should be handled by the OS
        if (url.startsWith('mws-pdmm://')) {
          event.preventDefault();
          console.log('Prevented navigation to protocol URL (should be handled by OS):', url);
        }
      });
    });
  }
}


export function allowExternalUrls(...args: ConstructorParameters<typeof ExternalUrls>) {
  return new ExternalUrls(...args);
}
