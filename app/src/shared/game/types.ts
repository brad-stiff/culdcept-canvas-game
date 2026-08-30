export type Element = 'neutral' | 'fire' | 'water' | 'earth' | 'air'

export type SquareType = 'castle' | 'land'

export type Square = {
  id: number
  name: string
  terrain: Element
  squareType: SquareType
  tollBase: number
}

export type CreatureCard = {
  id: string
  name: string
  cost: number
  attack: number
  defense: number
  element: Element
}

export type Territory = {
  squareId: number
  ownerId: number
  creature: CreatureCard
}

export type Player = {
  id: number
  name: string
  color: string
  gold: number
  position: number
  hand: CreatureCard[]
}

export type GamePhase = 'roll' | 'landed' | 'select_creature' | 'battle_result' | 'game_over'

export type LandedAction = 'place' | 'battle' | 'pay_toll' | 'skip'

export type BattleOutcome = {
  attackerWins: boolean
  attackPower: number
  defensePower: number
  message: string
}

export type GameConfig = {
  targetGold: number
  startGold: number
  passCastleGold: number
  board: Square[]
}

export type GameState = {
  config: GameConfig
  players: [Player, Player]
  currentPlayerIndex: 0 | 1
  territories: Territory[]
  phase: GamePhase
  lastRoll: number | null
  log: string[]
  pendingAction: LandedAction | null
  selectedSquareId: number | null
  lastBattle: BattleOutcome | null
  winnerId: number | null
}

export type GameAction =
  | { type: 'roll_dice' }
  | { type: 'choose_action'; action: LandedAction }
  | { type: 'select_creature'; cardId: string }
  | { type: 'acknowledge_battle' }
  | { type: 'end_turn' }
