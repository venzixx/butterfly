import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  updatePresence: (data) => ipcRenderer.send('UPDATE_PRESENCE', data),
  retryRpc: () => ipcRenderer.send('RETRY_DISCORD_RPC'),
  getRpcStatus: () => ipcRenderer.send('GET_RPC_STATUS'),
  onRpcStatusChange: (callback) => {
    ipcRenderer.on('DISCORD_RPC_STATUS_CHANGE', (event, data) => callback(data));
  },
});
