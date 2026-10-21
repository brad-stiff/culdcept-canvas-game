import { chainSize, squareById } from './board'
import type { GameState, Player, SymbolCounts } from './types'

export function countSymbols(state: GameState, playerId: number): SymbolCounts {
  const counts: SymbolCounts = { fire: 0, water: 0, earth: 0, air: 0, neutral: 0 }
  for (const t of state.territories) {
    if (t.ownerId !== playerId) continue
    const terrain = squareById(state.config.board, t.squareId).terrain
    if (terrain === 'fire' || terrain === 'water' || terrain === 'earth' || terrain === 'air') {
      counts[terrain] += t.level
    } else {
      counts.neutral += t.level
    }
  }
  return counts
}

export function symbolLevelTotal(state: GameState, playerId: number): number {
  const c = countSymbols(state, playerId)
  return c.fire + c.water + c.earth + c.air + c.neutral
}

export function symbolMagic(state: GameState, playerId: number): number {
  return symbolLevelTotal(state, playerId) * state.config.symbolValue
}

/** Liquid magic + symbol conversion toward the Free Battle goal. */
export function totalMagic(state: GameState, player: Player): number {
  return player.magic + symbolMagic(state, player.id)
}

/**
 * Phase-1 toll: landValue * level/5 scale * chain multiplier.
 * Colosseum lands use landValue 100 → level-1 toll 50 before chain.
 */
export function tollAmount(state: GameState, squareId: number): number {
  const terr = state.territories.find((t) => t.squareId === squareId)
  if (!terr) return 0
  const square = squareById(state.config.board, squareId)
  if (square.squareType !== 'land') return 0
  const chain = chainSize(state, squareId, terr.ownerId)
  const levelFactor = 0.5 + terr.level * 0.5
  const chainFactor = 1 + 0.25 * Math.max(0, chain - 1)
  let amount = Math.floor(square.landValue * levelFactor * chainFactor)
  if (terr.tollHalved) amount = Math.floor(amount / 2)
  return amount
}
