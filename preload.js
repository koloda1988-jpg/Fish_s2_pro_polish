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
  readTextFile: (p) => ipcRenderer.invoke('fs:readText', p),
  writeTextFile: (path, text) => ipcRenderer.invoke('fs:writeText', { path, text }),

  // cleanup user data
  cleanupUserData: (payload) => ipcRenderer.invoke('cleanup:userdata', payload || {}),
  onCleanupProgress: (cb) => {
    const fn = (_evt, data) => cb(data);
    ipcRenderer.on('cleanup:progress', fn);
    return () => ipcRenderer.removeListener('cleanup:progress', fn);
  },

  // reload renderera (bez restartu serwera TTS)
  reloadApp: () => ipcRenderer.invoke('window:reload'),

  // python backend (JSON-RPC over stdin/stdout)
  py: (method, params) => ipcRenderer.invoke('py:call', method, params),

  // Gemini preparation flow
  prepareBookWithGemini: (payload) => ipcRenderer.invoke('gemini:prepareBook', payload),

  // Audiobook player
  scanAudiobooks: (payload) => ipcRenderer.invoke('audiobooks:scan', payload),

  // i18n (dynamic language files from languages/*.json)
  i18nListLanguages: () => ipcRenderer.invoke('i18n:listLanguages'),
  i18nReadLanguage: (code) => ipcRenderer.invoke('i18n:readLanguage', code),

  // Models manager
  getModelsStatus:   (modelKey) => ipcRenderer.invoke('models:getLocalStatus', modelKey),
  listRemoteModels:  (modelKey) => ipcRenderer.invoke('models:listRemote', modelKey),
  downloadModelFile: (opts)     => ipcRenderer.invoke('models:startDownload', opts),
  cancelDownload:    ()         => ipcRenderer.invoke('models:cancelDownload'),
  openModelsDir:     (modelKey) => ipcRenderer.invoke('models:openDir', modelKey),
  onModelProgress: (cb) => {
    const fn = (_evt, data) => cb(data);
    ipcRenderer.on('models:progress', fn);
    return () => ipcRenderer.removeListener('models:progress', fn);
  },

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
