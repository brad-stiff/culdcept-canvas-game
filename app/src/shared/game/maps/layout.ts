import type { Square } from '../types'

/** Clockwise ring exits for simple loop maps. */
export function withClockwiseExits(board: Omit<Square, 'exits'>[]): Square[] {
  const n = board.length
  return board.map((s, i) => ({ ...s, exits: [(i + 1) % n] }))
}

/** Diamond / rectangle perimeter positions for single-loop boards. */
export function loopLayoutPositions(
  count: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number
): { x: number; y: number }[] {
  if (count <= 0) return []
  const corners = [
    { x: cx, y: cy - radiusY },
    { x: cx + radiusX, y: cy },
    { x: cx, y: cy + radiusY },
    { x: cx - radiusX, y: cy }
  ]
  const positions: { x: number; y: number }[] = []
  const sideLen = count / 4
  // Prefer even distribution when count is not divisible by 4
  if (!Number.isInteger(sideLen)) {
    for (let i = 0; i < count; i++) {
      const t = i / count
      const angle = -Math.PI / 2 + t * Math.PI * 2
      positions.push({
        x: cx + Math.cos(angle) * radiusX,
        y: cy + Math.sin(angle) * radiusY
      })
    }
    return positions
  }
  for (let side = 0; side < 4; side++) {
    const a = corners[side]
    const b = corners[(side + 1) % 4]
    for (let i = 0; i < sideLen; i++) {
      const t = i / sideLen
      positions.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      })
    }
  }
  return positions
}
