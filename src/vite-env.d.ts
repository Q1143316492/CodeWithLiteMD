/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 为 Electron 预加载脚本中暴露的 API 定义类型
export interface IElectronAPI {
  saveFile: (data: { path?: string; content: string }) => Promise<{ success: boolean; path?: string; error?: string }>
  onMenuNewFile: (callback: () => void) => void
  onMenuOpenFile: (callback: (data: { path: string; content: string }) => void) => void
  onMenuSaveFile: (callback: () => void) => void
  onMenuSaveAsFile: (callback: () => void) => void
  removeAllListeners: (channel: string) => void
}

// 扩展全局 Window 类型，使其能够识别 electronAPI
declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}
