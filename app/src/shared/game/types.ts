import type { SagaCardElement, SagaCardKind } from '../cards/types'

export type Element = Exclude<SagaCardElement, 'dual' | null> | 'dual'

export type SquareType = 'castle' | 'fort' | 'shrine' | 'land'

export type Square = {
  id: number
  name: string
  terrain: Element
  squareType: SquareType
  /** Display / base land value used in toll math (Colosseum lands use 100). */
  landValue: number
}

export type Keyword = 'attacks_first' | 'item_st' | 'item_hp'

export type MatchCard = {
  instanceId: string
  catalogId: string
  name: string
  kind: SagaCardKind
  element: SagaCardElement
  st: number
  hp: number
  mhp: number
  cost: number
  abilityText: string
  /** Parsed Phase-1 keywords only. */
  keywords: Keyword[]
  /** Item bonus magnitudes when keywords include item_st / item_hp. */
  itemBonusSt: number
  itemBonusHp: number
}

export type Territory = {
  squareId: number
  ownerId: number
  creature: MatchCard
  level: number
}

export type SymbolCounts = {
  fire: number
  water: number
  earth: number
  air: number
  neutral: number
}

export type Player = {
  id: number
  name: string
  color: string
  /** Liquid magic (G). */
  magic: number
  position: number
  hand: MatchCard[]
  book: MatchCard[]
  discard: MatchCard[]
  isAi: boolean
}

export type GamePhase =
  | 'upkeep'
  | 'roll'
  | 'landed'
  | 'select_creature'
  | 'select_item'
  | 'select_spell'
  | 'territory_menu'
  | 'battle_result'
  | 'game_over'

export type LandedAction =
  | 'place'
  | 'battle'
  | 'pay_toll'
  | 'level_up'
  | 'cast_spell'
  | 'shrine'
  | 'skip'

export type BattleOutcome = {
  attackerWins: boolean
  attackerRemainingHp: number
  defenderRemainingHp: number
  message: string
}

export type GameConfig = {
  mapId: string
  mapName: string
  targetMagic: number
  startMagic: number
  lapMagic: number
  fortMagic: number
  maxDie: number
  handLimit: number
  maxLandLevel: number
  symbolValue: number
  board: Square[]
}

export type GameState = {
  config: GameConfig
  /** 2–4 cepters. */
  players: Player[]
  currentPlayerIndex: number
  territories: Territory[]
  phase: GamePhase
  lastRoll: number | null
  log: string[]
  pendingAction: LandedAction | null
  selectedSquareId: number | null
  lastBattle: BattleOutcome | null
  winnerId: number | null
  /** Creature chosen for invasion before optional item. */
  pendingAttackerId: string | null
}

export type GameAction =
  | { type: 'begin_upkeep' }
  | { type: 'roll_dice' }
  | { type: 'choose_action'; action: LandedAction }
  | { type: 'select_creature'; cardId: string }
  | { type: 'select_item'; cardId: string | null }
  | { type: 'select_spell'; cardId: string }
  | { type: 'acknowledge_battle' }
  | { type: 'end_turn' }

export type MatchSeat = {
  name: string
  isAi: boolean
}
