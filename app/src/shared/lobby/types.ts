export type SeatKind = 'human' | 'ai' | 'open'

export type LobbySeat = {
  index: number
  kind: SeatKind
  /** Display name when kind is human or ai. */
  name: string
  /** LAN client id occupying a human seat (host-local humans use null). */
  clientId: string | null
  /**
   * Book selection: 'starter' or saved book id.
   * Custom books resolve via localStorage on the machine that starts the match.
   */
  bookId: string
}

export type FreeBattleLobbyConfig = {
  seats: LobbySeat[]
  mapId: string
}

export type PlayMode = 'local' | 'host' | 'join'

/** Non-open seats — Free Battle allows 2–4. */
export function filledSeats(config: FreeBattleLobbyConfig): LobbySeat[] {
  return config.seats.filter((s) => s.kind !== 'open')
}

export function canStartFreeBattle(config: FreeBattleLobbyConfig): boolean {
  const filled = filledSeats(config)
  if (filled.length < 2 || filled.length > 4) return false
  return filled.every((s) => s.name.trim().length > 0)
}

/** LAN host: every human seat must be claimed (host seat 0 local, others by clientId). */
export function canStartLanHost(config: FreeBattleLobbyConfig, hostClientId: string): boolean {
  if (!canStartFreeBattle(config)) return false
  return filledSeats(config)
    .filter((s) => s.kind === 'human')
    .every((s) => s.clientId === hostClientId || (s.clientId != null && s.clientId.length > 0))
}

export function defaultLobbyConfig(localPlayerName: string): FreeBattleLobbyConfig {
  return {
    mapId: 'colosseum-i',
    seats: [
      { index: 0, kind: 'human', name: localPlayerName, clientId: null, bookId: 'starter' },
      { index: 1, kind: 'ai', name: 'AI Rival', clientId: null, bookId: 'starter' },
      { index: 2, kind: 'open', name: '', clientId: null, bookId: 'starter' },
      { index: 3, kind: 'open', name: '', clientId: null, bookId: 'starter' }
    ]
  }
}
