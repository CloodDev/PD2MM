import {sha256sum} from './nodeCrypto.js';
import {versions} from './versions.js';
import {ipcRenderer, contextBridge} from 'electron';

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

type ElectronListener = (...args: any[]) => void;

const listenerMap = new Map<string, Map<ElectronListener, ElectronListener>>();

function getListenerMap(channel: string) {
  let channelListeners = listenerMap.get(channel);
  if (!channelListeners) {
    channelListeners = new Map();
    listenerMap.set(channel, channelListeners);
  }

  return channelListeners;
}

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, func: ElectronListener) => {
      const wrappedListener = (_event: unknown, ...args: unknown[]) => func(...args);
      getListenerMap(channel).set(func, wrappedListener);
      ipcRenderer.on(channel, wrappedListener);
    },
    removeListener: (channel: string, func: ElectronListener) => {
      const wrappedListener = listenerMap.get(channel)?.get(func);
      if (!wrappedListener) {
        return;
      }

      ipcRenderer.removeListener(channel, wrappedListener);
      listenerMap.get(channel)?.delete(func);
    }
  }        
});

export {sha256sum, versions, send};
