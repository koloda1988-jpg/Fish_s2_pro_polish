// preload.js - bezpieczny most miedzy renderer a main process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // dialogs
  openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  openDirectory: (opts) => ipcRenderer.invoke('dialog:openDirectory', opts),
  getDefaultWorkdir: () => ipcRenderer.invoke('config:getDefaultWorkdir'),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),

  // shell helpers
  openInExplorer: (p) => ipcRenderer.invoke('shell:openFolder', p),
  openWavFile: (p) => ipcRenderer.invoke('shell:openFile', p),

  // reload renderera (bez restartu serwera TTS)
  reloadApp: () => ipcRenderer.invoke('window:reload'),

  // python backend (JSON-RPC over stdin/stdout)
  py: (method, params) => ipcRenderer.invoke('py:call', method, params),

  // Gemini preparation flow
  prepareBookWithGemini: (payload) => ipcRenderer.invoke('gemini:prepareBook', payload),

  // events from python
  onEvent: (cb) => {
    const fn = (_evt, msg) => cb(msg);
    ipcRenderer.on('backend:event', fn);
    return () => ipcRenderer.removeListener('backend:event', fn);
  },
  onLog: (cb) => {
    const fn = (_evt, line) => cb(line);
    ipcRenderer.on('backend:log', fn);
    return () => ipcRenderer.removeListener('backend:log', fn);
  },
});
