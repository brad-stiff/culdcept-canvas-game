import { squareById } from '../../../shared/game/board'
import type { GameState, MatchCard, Square, Territory } from '../../../shared/game/types'

export type BoardLayout = {
  width: number
  height: number
  squarePositions: { x: number; y: number }[]
}

export const HAND_CARD_W = 86
export const HAND_CARD_H = 118
export const HAND_GAP = 8
export const HAND_ABOVE_BAR = 56

export type HandLayout = {
  startX: number
  y: number
  cardW: number
  cardH: number
  gap: number
}

export type InspectTarget =
  | { kind: 'hand'; card: MatchCard }
  | { kind: 'land'; territory: Territory; square: Square }

export function squareHitSize(layout: BoardLayout): number {
  return Math.max(40, Math.min(layout.width, layout.height) * 0.07)
}

export function handLayout(count: number, viewW: number, viewH: number): HandLayout {
  const cardW = HAND_CARD_W
  const gap = HAND_GAP
  const totalW = count * cardW + Math.max(0, count - 1) * gap
  return {
    startX: (viewW - totalW) / 2,
    y: viewH - HAND_ABOVE_BAR - HAND_CARD_H,
    cardW,
    cardH: HAND_CARD_H,
    gap
  }
}

export function cardInHandAt(
  hand: MatchCard[],
  viewW: number,
  viewH: number,
  x: number,
  y: number
): MatchCard | null {
  const layout = handLayout(hand.length, viewW, viewH)
  for (let i = 0; i < hand.length; i++) {
    const cx = layout.startX + i * (layout.cardW + layout.gap)
    if (hitRect(x, y, cx, layout.y, layout.cardW, layout.cardH)) return hand[i]
  }
  return null
}

export function squarePosition(
  layout: BoardLayout,
  board: Square[],
  squareId: number
): { x: number; y: number } {
  const idx = board.findIndex((s) => s.id === squareId)
  return layout.squarePositions[idx >= 0 ? idx : squareId]
}

export function territoryAtPoint(
  state: GameState,
  layout: BoardLayout,
  x: number,
  y: number
): Territory | null {
  const size = squareHitSize(layout)
  for (const terr of state.territories) {
    const pos = squarePosition(layout, state.config.board, terr.squareId)
    if (hitRect(x, y, pos.x - size / 2, pos.y - size / 2, size, size)) return terr
  }
  return null
}

export function inspectTargetAt(
  state: GameState,
  layout: BoardLayout | null,
  viewW: number,
  viewH: number,
  x: number,
  y: number
): InspectTarget | null {
  const player = state.players[state.currentPlayerIndex]
  const handCard = cardInHandAt(player?.hand ?? [], viewW, viewH, x, y)
  if (handCard) return { kind: 'hand', card: handCard }
  if (!layout) return null
  const terr = territoryAtPoint(state, layout, x, y)
  if (!terr) return null
  return {
    kind: 'land',
    territory: terr,
    square: squareById(state.config.board, terr.squareId)
  }
}

export function inspectKey(target: InspectTarget | null): string {
  if (!target) return ''
  if (target.kind === 'hand') return `hand:${target.card.instanceId}`
  return `land:${target.territory.squareId}`
}

export function hitRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h
}
