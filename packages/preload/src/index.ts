import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer, contextBridge} from 'electron';
import * as fs from 'fs';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  }        
});

export {sha256sum, versions, send};
