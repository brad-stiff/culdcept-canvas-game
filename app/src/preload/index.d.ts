import { ElectronAPI } from '@electron-toolkit/preload'

export type LanApi = {
  listAddresses: () => Promise<string[]>
  startHost: (port?: number) => Promise<{ port: number; addresses: string[] }>
  stopHost: () => Promise<boolean>
  broadcast: (payload: unknown) => Promise<boolean>
  sendToClient: (clientId: string, payload: unknown) => Promise<boolean>
  connect: (host: string, port: number) => Promise<boolean>
  disconnect: () => Promise<boolean>
  sendToHost: (payload: unknown) => Promise<boolean>
  onFromClient: (handler: (msg: unknown) => void) => () => void
  onFromHost: (handler: (msg: unknown) => void) => () => void
  onClientLeft: (handler: (payload: { clientId: string }) => void) => () => void
  onDisconnected: (handler: () => void) => () => void
}

export type WindowApi = {
  lan: LanApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowApi
  }
}

export {}
