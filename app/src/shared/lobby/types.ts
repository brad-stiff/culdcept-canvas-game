export type SeatKind = 'human' | 'ai' | 'open'

export type LobbySeat = {
  index: number
  kind: SeatKind
  /** Display name when kind is human or ai. */
  name: string
}

export type FreeBattleLobbyConfig = {
  seats: LobbySeat[]
}

/** Exactly two non-open seats — matches current 2-player match engine. */
export function filledSeats(config: FreeBattleLobbyConfig): LobbySeat[] {
  return config.seats.filter((s) => s.kind !== 'open')
}

export function canStartFreeBattle(config: FreeBattleLobbyConfig): boolean {
  return filledSeats(config).length === 2
}

export function defaultLobbyConfig(localPlayerName: string): FreeBattleLobbyConfig {
  return {
    seats: [
      { index: 0, kind: 'human', name: localPlayerName },
      { index: 1, kind: 'ai', name: 'AI Rival' },
      { index: 2, kind: 'open', name: '' },
      { index: 3, kind: 'open', name: '' }
    ]
  }
}
