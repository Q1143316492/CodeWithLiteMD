import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // 文件操作
  saveFile: (data: { path?: string; content: string }) => 
    ipcRenderer.invoke('save-file', data),
  
  // 监听菜单事件
  onMenuNewFile: (callback: () => void) => 
    ipcRenderer.on('menu-new-file', callback),
  onMenuOpenFile: (callback: (data: { path: string; content: string }) => void) => 
    ipcRenderer.on('menu-open-file', (_event, data) => callback(data)),
  onMenuSaveFile: (callback: () => void) => 
    ipcRenderer.on('menu-save-file', callback),
  onMenuSaveAsFile: (callback: () => void) => 
    ipcRenderer.on('menu-save-as-file', callback),
  
  // 清理监听器
  removeAllListeners: (channel: string) => 
    ipcRenderer.removeAllListeners(channel)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
