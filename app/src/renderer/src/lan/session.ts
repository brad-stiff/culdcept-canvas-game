import { runAiUntilHuman } from '../../../shared/game/ai'
import { reduceGame, startMatch } from '../../../shared/game/state'
import type { GameAction, GameState, MatchSeat } from '../../../shared/game/types'
import type { LanClientMessage, LanHostMessage } from '../../../shared/lan/protocol'
import { filledSeats, type FreeBattleLobbyConfig } from '../../../shared/lobby/types'

function seatsFromLobby(
  lobby: FreeBattleLobbyConfig,
  resolveBook?: (bookId: string) => string[] | null
): MatchSeat[] {
  return filledSeats(lobby).map((s) => {
    const catalogIds = resolveBook?.(s.bookId ?? 'starter') ?? null
    return {
      name: s.name,
      isAi: s.kind === 'ai',
      ...(catalogIds ? { bookCatalogIds: catalogIds } : {})
    }
  })
}

function playerIdForClient(lobby: FreeBattleLobbyConfig, clientId: string): number | null {
  const filled = filledSeats(lobby)
  const idx = filled.findIndex((s) => s.kind === 'human' && s.clientId === clientId)
  return idx >= 0 ? idx : null
}

export type HostSession = {
  getLobby: () => FreeBattleLobbyConfig
  setLobby: (lobby: FreeBattleLobbyConfig) => void
  getState: () => GameState | null
  setState: (state: GameState) => void
  dispose: () => void
  broadcastLobby: () => void
  startMatch: () => void
  applyHostAction: (action: GameAction) => void
}

export async function createHostSession(opts: {
  lobby: FreeBattleLobbyConfig
  hostClientId: string
  resolveBook?: (bookId: string) => string[] | null
  onLobbyChange: (lobby: FreeBattleLobbyConfig) => void
  onState: (state: GameState) => void
  onStatus: (text: string) => void
}): Promise<HostSession> {
  const lan = window.api.lan
  const info = await lan.startHost()
  opts.onStatus(
    `Hosting on port ${info.port} — ${info.addresses.join(', ') || 'check your LAN IP'}`
  )

  let lobby = structuredClone(opts.lobby)
  const hostSeat = lobby.seats.find((s) => s.kind === 'human')
  if (hostSeat) hostSeat.clientId = opts.hostClientId

  let state: GameState | null = null

  const broadcast = (msg: LanHostMessage): void => {
    void lan.broadcast(msg)
  }

  const send = (clientId: string, msg: LanHostMessage): void => {
    void lan.sendToClient(clientId, msg)
  }

  const broadcastLobby = (): void => {
    opts.onLobbyChange(lobby)
    broadcast({ type: 'lobby', lobby })
  }

  const tryClaim = (clientId: string, name: string): number | null => {
    const existing = lobby.seats.find((s) => s.clientId === clientId)
    if (existing && existing.kind === 'human') {
      existing.name = name
      broadcastLobby()
      return playerIdForClient(lobby, clientId)
    }
    const assignable = lobby.seats.find(
      (s) => s.kind === 'human' && s.clientId == null && s !== hostSeat
    )
    if (!assignable) return null
    assignable.clientId = clientId
    assignable.name = name
    broadcastLobby()
    return playerIdForClient(lobby, clientId)
  }

  const pushState = (next: GameState): void => {
    state = next
    opts.onState(next)
    broadcast({ type: 'state', state: next })
  }

  const applyClientMessage = (msg: LanClientMessage): void => {
    if (msg.type === 'hello' || msg.type === 'rejoin') {
      const playerId = tryClaim(msg.clientId, msg.name)
      send(msg.clientId, {
        type: 'welcome',
        clientId: msg.clientId,
        playerId,
        lobby,
        hostName: hostSeat?.name ?? 'Host'
      })
      if (playerId == null) {
        send(msg.clientId, {
          type: 'error',
          message: 'No open human seat. Ask the host to set a Human seat.'
        })
        return
      }
      if (state) {
        send(msg.clientId, {
          type: 'match_start',
          seats: seatsFromLobby(lobby),
          yourPlayerId: playerId
        })
        send(msg.clientId, { type: 'state', state })
      }
      return
    }
    if (msg.type === 'action') {
      if (!state) return
      const pid = playerIdForClient(lobby, msg.clientId)
      if (pid == null || state.currentPlayerIndex !== pid) return
      if (state.players[pid]?.isAi) return
      let next = reduceGame(state, msg.action)
      next = runAiUntilHuman(next)
      pushState(next)
    }
  }

  const unsubClient = lan.onFromClient((raw) => {
    applyClientMessage(raw as LanClientMessage)
  })
  const unsubLeft = lan.onClientLeft(({ clientId }) => {
    const seat = lobby.seats.find((s) => s.clientId === clientId)
    if (seat && seat.kind === 'human') {
      seat.clientId = null
      broadcastLobby()
      opts.onStatus(`${seat.name || 'Player'} disconnected — seat open for rejoin.`)
    }
  })

  broadcastLobby()

  return {
    getLobby: () => lobby,
    setLobby: (next) => {
      lobby = structuredClone(next)
      const seat = lobby.seats.find((s) => s.kind === 'human')
      if (seat) seat.clientId = opts.hostClientId
      broadcastLobby()
    },
    getState: () => state,
    setState: (next) => {
      state = next
    },
    dispose() {
      unsubClient()
      unsubLeft()
      void lan.stopHost()
    },
    broadcastLobby,
    startMatch() {
      const seats = seatsFromLobby(lobby, opts.resolveBook)
      let next = startMatch(seats, { mapId: lobby.mapId || 'colosseum-i' })
      next = runAiUntilHuman(next)
      for (const seat of filledSeats(lobby)) {
        if (seat.kind !== 'human' || !seat.clientId) continue
        const yourPlayerId = playerIdForClient(lobby, seat.clientId)
        if (yourPlayerId == null) continue
        send(seat.clientId, {
          type: 'match_start',
          seats,
          yourPlayerId
        })
      }
      pushState(next)
    },
    applyHostAction(action: GameAction) {
      if (!state) return
      const hostPid = playerIdForClient(lobby, opts.hostClientId)
      if (hostPid == null || state.currentPlayerIndex !== hostPid) return
      let next = reduceGame(state, action)
      next = runAiUntilHuman(next)
      pushState(next)
    }
  }
}

export type ClientSession = {
  dispose: () => void
}

export async function createClientSession(opts: {
  host: string
  port: number
  name: string
  clientId: string
  onWelcome: (playerId: number | null, lobby: FreeBattleLobbyConfig) => void
  onLobby: (lobby: FreeBattleLobbyConfig) => void
  onMatchStart: (seats: MatchSeat[], yourPlayerId: number) => void
  onState: (state: GameState) => void
  onError: (message: string) => void
  onDisconnected: () => void
}): Promise<ClientSession> {
  const lan = window.api.lan
  await lan.connect(opts.host, opts.port)

  const unsub = lan.onFromHost((raw) => {
    const msg = raw as LanHostMessage
    if (msg.type === 'welcome') {
      opts.onWelcome(msg.playerId, msg.lobby)
      return
    }
    if (msg.type === 'lobby') {
      opts.onLobby(msg.lobby)
      return
    }
    if (msg.type === 'match_start') {
      opts.onMatchStart(msg.seats, msg.yourPlayerId)
      return
    }
    if (msg.type === 'state') {
      opts.onState(msg.state)
      return
    }
    if (msg.type === 'error' || msg.type === 'seat_lost') {
      opts.onError(msg.message)
    }
  })
  const unsubDisc = lan.onDisconnected(() => opts.onDisconnected())

  await lan.sendToHost({
    type: 'rejoin',
    clientId: opts.clientId,
    name: opts.name
  } satisfies LanClientMessage)

  return {
    dispose() {
      unsub()
      unsubDisc()
      void lan.disconnect()
    }
  }
}

export function sendClientAction(clientId: string, action: GameAction): void {
  void window.api.lan.sendToHost({
    type: 'action',
    clientId,
    action
  } satisfies LanClientMessage)
}
