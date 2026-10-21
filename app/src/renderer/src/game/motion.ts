import { pathChoices, squareById, walkPath } from '../../../shared/game/board'
import type { GameState } from '../../../shared/game/types'

export type MovementPlan = {
  playerId: number
  fromId: number
  path: number[]
  dice: { result: number; maxDie: number } | null
}

/** How the canvas should present a state change (roll, fork, warp). */
export function movementPlan(prev: GameState, next: GameState): MovementPlan | null {
  const rolled =
    next.lastRoll != null &&
    prev.phase === 'roll' &&
    next.phase !== 'roll' &&
    next.lastRoll !== prev.lastRoll

  if (rolled) {
    const idx = prev.currentPlayerIndex
    const fromId = prev.players[idx].position
    const toId = next.players[idx].position
    const walk = walkPath(prev.config.board, fromId, next.lastRoll!, prev.pathFromId)
    return {
      playerId: prev.players[idx].id,
      fromId,
      path: withWarp(walk.path, walk.position, toId),
      dice: { result: next.lastRoll!, maxDie: next.config.maxDie }
    }
  }

  if (prev.phase === 'choose_path' && next.phase !== 'roll') {
    const idx = prev.currentPlayerIndex
    const fromId = prev.players[idx].position
    const toId = next.players[idx].position
    if (fromId === toId && next.phase === 'choose_path') return null
    const path = reconstructChoicePath(prev, fromId, toId)
    if (path.length === 0) return null
    return {
      playerId: prev.players[idx].id,
      fromId,
      path,
      dice: null
    }
  }

  return null
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function reconstructChoicePath(prev: GameState, fromId: number, toId: number): number[] {
  const board = prev.config.board
  const remainingAfter = Math.max(0, prev.pendingSteps - 1)
  const square = squareById(board, fromId)
  const choices = pathChoices(square, prev.pathFromId)
  for (const first of choices) {
    if (remainingAfter <= 0) {
      if (first === toId) return [first]
      const dest = squareById(board, first)
      if (dest.squareType === 'warp' && dest.warpTo === toId) return [first, toId]
      continue
    }
    const walk = walkPath(board, first, remainingAfter, fromId)
    const path = [first, ...walk.path]
    if (walk.position === toId) return path
    if (squareById(board, walk.position).warpTo === toId) return [...path, toId]
  }
  if (choices.includes(toId)) return [toId]
  return []
}

function withWarp(path: number[], walkPos: number, finalPos: number): number[] {
  if (walkPos === finalPos) return path
  if (path[path.length - 1] === finalPos) return path
  return [...path, finalPos]
}
