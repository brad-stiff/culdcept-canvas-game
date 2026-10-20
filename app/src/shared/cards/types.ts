/** Saga card kinds (abilities resolved in later phases). */
export type SagaCardKind = 'creature' | 'item' | 'spell'

/** Creature elements used in Saga; null for items/spells. */
export type SagaCardElement =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'earth'
  | 'air'
  | 'dual'
  | null

export type SagaCard = {
  id: string
  name: string
  kind: SagaCardKind
  element: SagaCardElement
  special: boolean
  st: number | null
  hp: number | null
  mhp: number | null
  cost: number
  /** Number of '+' suffixes on G cost in the source list (0–2). */
  costPlus: number
  abilityText: string
  flavor: string
  explanation: string
  source: string
}

export type SagaCatalog = {
  version: number
  game: string
  sourceUrl: string
  generatedAt: string
  counts: {
    total: number
    creature: number
    item: number
    spell: number
  }
  cards: SagaCard[]
}
