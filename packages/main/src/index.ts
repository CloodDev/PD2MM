import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/WindowManager.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';
import { dialog } from 'electron';
import * as fs from 'node:fs';
export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({enable: false}))
    .init(autoUpdater())

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    .init(allowInternalOrigins(
      new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
    ))
    .init(allowExternalUrls(
      new Set(
        initConfig.renderer instanceof URL
          ? [
            'https://vite.dev',
            'https://developer.mozilla.org',
            'https://solidjs.com',
            'https://qwik.dev',
            'https://lit.dev',
            'https://react.dev',
            'https://preactjs.com',
            'https://www.typescriptlang.org',
            'https://vuejs.org',
          ]
          : [],
      )),
    );
  await moduleRunner;
}


import { ipcMain } from 'electron';
ipcMain.handle('select-directory', async (event, operation) => {
  const properties: Array<'openDirectory' | 'createDirectory'> = operation === 'export' ? ['openDirectory', 'createDirectory'] : ['openDirectory'];
  const result = await dialog.showOpenDialog({
      properties: properties
  });
  if (result.canceled) {
      return null;
  } else {
      return result.filePaths[0];
  }
});


ipcMain.handle("list-mods", async (event, operation) => {
  console.log(operation);
  const mods = fs.readdirSync(operation + "/mods");
  return mods;
});

ipcMain.handle("load-options", async (event, operation) => {
  console.log(operation);
  const mods = fs.readdirSync(operation);
  return mods;
});