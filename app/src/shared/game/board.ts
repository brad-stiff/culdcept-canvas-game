import type { Element, GameState, Square, Territory } from './types'

export { COLOSSEUM_BOARD as MVP_BOARD } from './maps/colosseum'

export function squareById(board: Square[], id: number): Square {
  const square = board.find((s) => s.id === id)
  if (!square) {
    throw new Error(`Unknown square id ${id}`)
  }
  return square
}

export { withClockwiseExits } from './maps/layout'

export function pathChoices(square: Square, cameFrom: number | null): number[] {
  const exits = square.exits ?? []
  const filtered = cameFrom == null ? exits : exits.filter((id) => id !== cameFrom)
  return filtered.length > 0 ? filtered : exits
}

export function undirectedNeighbors(board: Square[], squareId: number): number[] {
  const sq = squareById(board, squareId)
  const next = new Set<number>(sq.exits)
  for (const other of board) {
    if (other.exits.includes(squareId)) next.add(other.id)
  }
  next.delete(squareId)
  return [...next]
}

export type WalkResult =
  | {
      kind: 'fork'
      position: number
      remaining: number
      cameFrom: number | null
      choices: number[]
      crossedCastle: boolean
      /** Squares entered after `start` (not including `start`). */
      path: number[]
    }
  | {
      kind: 'land'
      position: number
      cameFrom: number | null
      crossedCastle: boolean
      /** Squares entered after `start` (not including `start`). */
      path: number[]
    }

export function walkPath(
  board: Square[],
  start: number,
  steps: number,
  cameFrom: number | null
): WalkResult {
  let position = start
  let from = cameFrom
  let remaining = steps
  let crossedCastle = false
  const path: number[] = []
  while (remaining > 0) {
    const square = squareById(board, position)
    const choices = pathChoices(square, from)
    if (choices.length === 0) {
      return { kind: 'land', position, cameFrom: from, crossedCastle, path }
    }
    if (choices.length > 1) {
      return { kind: 'fork', position, remaining, cameFrom: from, choices, crossedCastle, path }
    }
    const next = choices[0]
    from = position
    position = next
    remaining -= 1
    path.push(position)
    if (squareById(board, position).squareType === 'castle') {
      crossedCastle = true
    }
  }
  return { kind: 'land', position, cameFrom: from, crossedCastle, path }
}

export function advancePosition(position: number, steps: number, boardLength: number): number {
  return (position + steps) % boardLength
}

/** True when movement wrapped past square 0 (legacy loop helper). */
export function crossedStart(oldPosition: number, newPosition: number): boolean {
  return newPosition < oldPosition || (oldPosition !== 0 && newPosition === 0)
}

export function territoryAt(state: GameState, squareId: number): Territory | undefined {
  return state.territories.find((t) => t.squareId === squareId)
}

/** Adjacent same-element lands owned by the same player (graph neighbors). */
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

  const visited = new Set<number>()
  const stack = [squareId]
  while (stack.length) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const n of undirectedNeighbors(board, id)) {
      if (owned.has(n)) stack.push(n)
    }
  }
  return visited.size
}

export function landEffectBonus(
  creatureElement: Element | null | undefined,
  square: Square,
  level: number
): number {
  if (!creatureElement || creatureElement === 'neutral' || creatureElement === 'dual') return 0
  if (square.terrain !== creatureElement) return 0
  return 10 * level
}

export function levelUpCost(level: number): number {
  return 100 * level
}

export function transformCost(level: number): number {
  return 100 * level
}

export function emptyAdjacentLands(state: GameState, squareId: number): number[] {
  return undirectedNeighbors(state.config.board, squareId).filter((id) => {
    const sq = squareById(state.config.board, id)
    return sq.squareType === 'land' && !territoryAt(state, id)
  })
}
