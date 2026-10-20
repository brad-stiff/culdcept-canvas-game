import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const lanApi = {
  listAddresses: (): Promise<string[]> => ipcRenderer.invoke('lan:list-addresses'),
  startHost: (port?: number): Promise<{ port: number; addresses: string[] }> =>
    ipcRenderer.invoke('lan:start-host', port),
  stopHost: (): Promise<boolean> => ipcRenderer.invoke('lan:stop-host'),
  broadcast: (payload: unknown): Promise<boolean> => ipcRenderer.invoke('lan:broadcast', payload),
  sendToClient: (clientId: string, payload: unknown): Promise<boolean> =>
    ipcRenderer.invoke('lan:send-to-client', clientId, payload),
  connect: (host: string, port: number): Promise<boolean> =>
    ipcRenderer.invoke('lan:connect', host, port),
  disconnect: (): Promise<boolean> => ipcRenderer.invoke('lan:disconnect'),
  sendToHost: (payload: unknown): Promise<boolean> => ipcRenderer.invoke('lan:send-to-host', payload),
  onFromClient: (handler: (msg: unknown) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, msg: unknown): void => handler(msg)
    ipcRenderer.on('lan:from-client', listener)
    return () => ipcRenderer.removeListener('lan:from-client', listener)
  },
  onFromHost: (handler: (msg: unknown) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, msg: unknown): void => handler(msg)
    ipcRenderer.on('lan:from-host', listener)
    return () => ipcRenderer.removeListener('lan:from-host', listener)
  },
  onClientLeft: (handler: (payload: { clientId: string }) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { clientId: string }): void =>
      handler(payload)
    ipcRenderer.on('lan:client-left', listener)
    return () => ipcRenderer.removeListener('lan:client-left', listener)
  },
  onDisconnected: (handler: () => void): (() => void) => {
    const listener = (): void => handler()
    ipcRenderer.on('lan:disconnected', listener)
    return () => ipcRenderer.removeListener('lan:disconnected', listener)
  }
}

const api = {
  lan: lanApi
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (defined in dts)
  window.electron = electronAPI
  // @ts-expect-error (defined in dts)
  window.api = api
}
