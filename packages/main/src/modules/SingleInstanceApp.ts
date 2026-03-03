import {AppModule} from '../AppModule.js';
import * as Electron from 'electron';

class SingleInstanceApp implements AppModule {
  enable({app}: {app: Electron.App}): void {
    const isSingleInstance = app.requestSingleInstanceLock();
    if (!isSingleInstance) {
      console.log('Another instance is already running. Quitting this instance...');
      app.quit();
      process.exit(0);
    }
    console.log('Single instance lock acquired successfully');
  }
}


export function disallowMultipleAppInstance(...args: ConstructorParameters<typeof SingleInstanceApp>) {
  return new SingleInstanceApp(...args);
}
