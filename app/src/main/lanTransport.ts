import { BrowserWindow, ipcMain } from 'electron'
import { createServer, Socket, type Server } from 'net'
import { networkInterfaces } from 'os'
import { LAN_DEFAULT_PORT } from '../shared/lan/protocol'

type ClientSocket = {
  socket: Socket
  buffer: string
  remoteId: string | null
}

let server: Server | null = null
let hostWindow: BrowserWindow | null = null
const clients = new Map<string, ClientSocket>()
let clientSocket: Socket | null = null
let clientBuffer = ''

function sendJson(socket: Socket, payload: unknown): void {
  socket.write(`${JSON.stringify(payload)}\n`)
}

export function listLanAddresses(): string[] {
  const nets = networkInterfaces()
  const out: string[] = []
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        out.push(entry.address)
      }
    }
  }
  return out
}

function emitToHost(channel: string, payload: unknown): void {
  if (hostWindow && !hostWindow.isDestroyed()) {
    hostWindow.webContents.send(channel, payload)
  }
}

function handleClientLine(entry: ClientSocket, line: string): void {
  try {
    const msg = JSON.parse(line) as { type?: string; clientId?: string }
    if (msg.clientId) {
      entry.remoteId = msg.clientId
      clients.set(msg.clientId, entry)
    }
    emitToHost('lan:from-client', msg)
  } catch {
    // ignore malformed
  }
}

export function startLanHost(win: BrowserWindow, port = LAN_DEFAULT_PORT): Promise<{ port: number; addresses: string[] }> {
  stopLanHost()
  hostWindow = win

  return new Promise((resolve, reject) => {
    server = createServer((socket) => {
      const entry: ClientSocket = { socket, buffer: '', remoteId: null }
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => {
        entry.buffer += chunk
        let idx: number
        while ((idx = entry.buffer.indexOf('\n')) >= 0) {
          const line = entry.buffer.slice(0, idx).trim()
          entry.buffer = entry.buffer.slice(idx + 1)
          if (line) handleClientLine(entry, line)
        }
      })
      socket.on('close', () => {
        if (entry.remoteId) {
          clients.delete(entry.remoteId)
          emitToHost('lan:client-left', { clientId: entry.remoteId })
        }
      })
      socket.on('error', () => {
        /* ignore */
      })
    })

    server.on('error', (err) => reject(err))
    server.listen(port, '0.0.0.0', () => {
      resolve({ port, addresses: listLanAddresses() })
    })
  })
}

export function stopLanHost(): void {
  for (const entry of clients.values()) {
    try {
      entry.socket.destroy()
    } catch {
      /* ignore */
    }
  }
  clients.clear()
  if (server) {
    try {
      server.close()
    } catch {
      /* ignore */
    }
  }
  server = null
  hostWindow = null
}

export function broadcastToClients(payload: unknown): void {
  for (const entry of clients.values()) {
    try {
      sendJson(entry.socket, payload)
    } catch {
      /* ignore */
    }
  }
}

export function sendToClient(clientId: string, payload: unknown): void {
  const entry = clients.get(clientId)
  if (!entry) return
  sendJson(entry.socket, payload)
}

export function connectLanClient(
  win: BrowserWindow,
  host: string,
  port: number
): Promise<void> {
  disconnectLanClient()
  hostWindow = win

  return new Promise((resolve, reject) => {
    const socket = new Socket()
    clientSocket = socket
    clientBuffer = ''
    socket.setEncoding('utf8')
    socket.connect(port, host, () => resolve())
    socket.on('data', (chunk) => {
      clientBuffer += chunk
      let idx: number
      while ((idx = clientBuffer.indexOf('\n')) >= 0) {
        const line = clientBuffer.slice(0, idx).trim()
        clientBuffer = clientBuffer.slice(idx + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          if (hostWindow && !hostWindow.isDestroyed()) {
            hostWindow.webContents.send('lan:from-host', msg)
          }
        } catch {
          /* ignore */
        }
      }
    })
    socket.on('error', (err) => reject(err))
    socket.on('close', () => {
      if (hostWindow && !hostWindow.isDestroyed()) {
        hostWindow.webContents.send('lan:disconnected', {})
      }
      clientSocket = null
    })
  })
}

export function disconnectLanClient(): void {
  if (clientSocket) {
    try {
      clientSocket.destroy()
    } catch {
      /* ignore */
    }
  }
  clientSocket = null
  clientBuffer = ''
}

export function sendToHost(payload: unknown): void {
  if (!clientSocket) return
  sendJson(clientSocket, payload)
}

export function registerLanIpc(): void {
  ipcMain.handle('lan:list-addresses', () => listLanAddresses())

  ipcMain.handle('lan:start-host', async (event, port?: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')
    return startLanHost(win, port ?? LAN_DEFAULT_PORT)
  })

  ipcMain.handle('lan:stop-host', () => {
    stopLanHost()
    return true
  })

  ipcMain.handle('lan:broadcast', (_event, payload: unknown) => {
    broadcastToClients(payload)
    return true
  })

  ipcMain.handle('lan:send-to-client', (_event, clientId: string, payload: unknown) => {
    sendToClient(clientId, payload)
    return true
  })

  ipcMain.handle('lan:connect', async (event, host: string, port: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')
    await connectLanClient(win, host, port)
    return true
  })

  ipcMain.handle('lan:disconnect', () => {
    disconnectLanClient()
    return true
  })

  ipcMain.handle('lan:send-to-host', (_event, payload: unknown) => {
    sendToHost(payload)
    return true
  })
}
