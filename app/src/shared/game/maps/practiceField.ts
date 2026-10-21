import type { GameConfig, Square } from '../types'
import { withClockwiseExits } from './layout'

/**
 * Culdcept Saga — simplest Free Battle loop (Practice Field).
 * Source stats: S/100G fort, die 1–6, start/lap 200G, goal 5000G,
 * 18 tiles, 4 of each element, no shrine.
 *
 * Loop clockwise from Castle (N):
 * Castle → Fire×2 → Air×2 → Water×2 → Earth×2 → South Fort
 * → Fire×2 → Air×2 → Water×2 → Earth×2 → Castle
 */
function land(id: number, name: string, terrain: Square['terrain']): Omit<Square, 'exits'> {
  return { id, name, terrain, squareType: 'land', landValue: 100 }
}

const PRACTICE_FIELD_SQUARES: Omit<Square, 'exits'>[] = [
  { id: 0, name: 'Castle', terrain: 'neutral', squareType: 'castle', landValue: 0 },
  land(1, 'Fire Path', 'fire'),
  land(2, 'Fire Path', 'fire'),
  land(3, 'Air Path', 'air'),
  land(4, 'Air Path', 'air'),
  land(5, 'Water Path', 'water'),
  land(6, 'Water Path', 'water'),
  land(7, 'Earth Path', 'earth'),
  land(8, 'Earth Path', 'earth'),
  { id: 9, name: 'South Fort', terrain: 'neutral', squareType: 'fort', landValue: 0 },
  land(10, 'Fire Path', 'fire'),
  land(11, 'Fire Path', 'fire'),
  land(12, 'Air Path', 'air'),
  land(13, 'Air Path', 'air'),
  land(14, 'Water Path', 'water'),
  land(15, 'Water Path', 'water'),
  land(16, 'Earth Path', 'earth'),
  land(17, 'Earth Path', 'earth')
]

export const PRACTICE_FIELD_BOARD: Square[] = withClockwiseExits(PRACTICE_FIELD_SQUARES)

export const PRACTICE_FIELD_CONFIG: GameConfig = {
  mapId: 'practice-field',
  mapName: 'Practice Field',
  targetMagic: 5000,
  startMagic: 200,
  lapMagic: 200,
  fortMagic: 100,
  maxDie: 6,
  handLimit: 6,
  maxLandLevel: 5,
  symbolValue: 50,
  board: PRACTICE_FIELD_BOARD
}
