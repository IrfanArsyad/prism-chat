const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  getConversations: () => ipcRenderer.invoke('conversations:get'),
  setConversations: (c) => ipcRenderer.invoke('conversations:set', c),
  listModels: () => ipcRenderer.invoke('openrouter:models'),
  sendChat: (payload) => ipcRenderer.send('openrouter:chat', payload),
  abortChat: (id) => ipcRenderer.send('openrouter:abort', id),
  onChatDelta: (cb) => ipcRenderer.on('openrouter:chat:delta', (_e, data) => cb(data)),
  onChatDone: (cb) => ipcRenderer.on('openrouter:chat:done', (_e, data) => cb(data)),
  onChatError: (cb) => ipcRenderer.on('openrouter:chat:error', (_e, data) => cb(data))
});
