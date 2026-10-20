import type { GameAction, GameState, MatchSeat } from '../game/types'
import type { FreeBattleLobbyConfig } from '../lobby/types'

export const LAN_DEFAULT_PORT = 47111

/** Messages client → host (relayed by main). */
export type LanClientMessage =
  | { type: 'hello'; clientId: string; name: string }
  | { type: 'rejoin'; clientId: string; name: string }
  | { type: 'action'; clientId: string; action: GameAction }
  | { type: 'ping'; clientId: string }

/** Messages host → clients (broadcast or directed). */
export type LanHostMessage =
  | {
      type: 'welcome'
      clientId: string
      playerId: number | null
      lobby: FreeBattleLobbyConfig
      hostName: string
    }
  | { type: 'lobby'; lobby: FreeBattleLobbyConfig }
  | { type: 'match_start'; seats: MatchSeat[]; yourPlayerId: number }
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string }
  | { type: 'seat_lost'; message: string }

export type LanWireMessage =
  | ({ role: 'client' } & LanClientMessage)
  | ({ role: 'host' } & LanHostMessage)
