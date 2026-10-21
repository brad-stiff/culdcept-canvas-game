import type { GameConfig, Square } from '../types'
import { loopLayoutPositions, withClockwiseExits } from './layout'

/**
 * Culdcept Saga — Colosseum I (story opener).
 * Source: https://culdceptcentral.com/culdcept-saga/culdcept-saga-map-list
 *
 * Diamond loop, clockwise from Castle (N):
 * Castle → 2 Fire → 2 Air → Fort(E) → 2 Air → 2 Water → Shrine(S)
 * → 2 Fire → 2 Earth → Fort(W) → 2 Earth → 2 Water → Castle
 *
 * Stats: die 1–6, start/lap 200G, forts EW/80G, goal 5000G, 1 shrine, 16 elemental lands.
 */
function land(id: number, name: string, terrain: Square['terrain']): Omit<Square, 'exits'> {
  return { id, name, terrain, squareType: 'land', landValue: 100 }
}

const COLOSSEUM_SQUARES: Omit<Square, 'exits'>[] = [
  { id: 0, name: 'Castle', terrain: 'neutral', squareType: 'castle', landValue: 0 },
  land(1, 'Fire Path', 'fire'),
  land(2, 'Fire Path', 'fire'),
  land(3, 'Air Path', 'air'),
  land(4, 'Air Path', 'air'),
  { id: 5, name: 'East Fort', terrain: 'neutral', squareType: 'fort', landValue: 0 },
  land(6, 'Air Path', 'air'),
  land(7, 'Air Path', 'air'),
  land(8, 'Water Path', 'water'),
  land(9, 'Water Path', 'water'),
  { id: 10, name: 'Shrine', terrain: 'neutral', squareType: 'shrine', landValue: 0 },
  land(11, 'Fire Path', 'fire'),
  land(12, 'Fire Path', 'fire'),
  land(13, 'Earth Path', 'earth'),
  land(14, 'Earth Path', 'earth'),
  { id: 15, name: 'West Fort', terrain: 'neutral', squareType: 'fort', landValue: 0 },
  land(16, 'Earth Path', 'earth'),
  land(17, 'Earth Path', 'earth'),
  land(18, 'Water Path', 'water'),
  land(19, 'Water Path', 'water')
]

export const COLOSSEUM_BOARD: Square[] = withClockwiseExits(COLOSSEUM_SQUARES)

export const COLOSSEUM_CONFIG: GameConfig = {
  mapId: 'colosseum-i',
  mapName: 'Colosseum',
  targetMagic: 5000,
  startMagic: 200,
  lapMagic: 200,
  fortMagic: 80,
  maxDie: 6,
  handLimit: 6,
  maxLandLevel: 5,
  symbolValue: 50,
  board: COLOSSEUM_BOARD
}

/** @deprecated Prefer loopLayoutPositions — kept for callers. */
export function colosseumLayoutPositions(
  count: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number
): { x: number; y: number }[] {
  return loopLayoutPositions(count, cx, cy, radiusX, radiusY)
}
