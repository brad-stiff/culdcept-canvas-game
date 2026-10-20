import type { Element, GameState, Square, Territory } from './types'

export { COLOSSEUM_BOARD as MVP_BOARD } from './maps/colosseum'

export function squareById(board: Square[], id: number): Square {
  const square = board.find((s) => s.id === id)
  if (!square) {
    throw new Error(`Unknown square id ${id}`)
  }
  return square
}

export function advancePosition(position: number, steps: number, boardLength: number): number {
  return (position + steps) % boardLength
}

/** True when movement wrapped past square 0 (lap bonus). */
export function crossedStart(oldPosition: number, newPosition: number): boolean {
  return newPosition < oldPosition || (oldPosition !== 0 && newPosition === 0)
}

export function territoryAt(state: GameState, squareId: number): Territory | undefined {
  return state.territories.find((t) => t.squareId === squareId)
}

/** Adjacent same-element lands owned by the same player (loop neighbors). */
export function chainSize(state: GameState, squareId: number, ownerId: number): number {
  const board = state.config.board
  const terr = territoryAt(state, squareId)
  if (!terr || terr.ownerId !== ownerId) return 0
  const element = squareById(board, squareId).terrain
  if (element === 'neutral' || element === 'dual') return 1

  const owned = new Set(
    state.territories
      .filter((t) => t.ownerId === ownerId && squareById(board, t.squareId).terrain === element)
      .map((t) => t.squareId)
  )
  if (!owned.has(squareId)) return 0

  const n = board.length
  const visited = new Set<number>()
  const stack = [squareId]
  while (stack.length) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    const left = (id - 1 + n) % n
    const right = (id + 1) % n
    if (owned.has(left)) stack.push(left)
    if (owned.has(right)) stack.push(right)
  }
  return visited.size
}

export function landEffectBonus(creatureElement: Element | null | undefined, square: Square, level: number): number {
  if (!creatureElement || creatureElement === 'neutral' || creatureElement === 'dual') return 0
  if (square.terrain !== creatureElement) return 0
  return 10 * level
}

export function levelUpCost(level: number): number {
  return 100 * level
}
