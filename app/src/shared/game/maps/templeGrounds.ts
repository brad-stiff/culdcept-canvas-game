import type { GameConfig, Square } from '../types'
import { withClockwiseExits } from './layout'

/**
 * Temple Grounds — Central 20-tile temple loop plus a warp pair (22 tiles).
 * Base stats: die 1–6, start/lap 200G, fort S/100G, goal 6000G,
 * 4 of each element, 1 temple, 1 fortune-teller.
 */
function land(id: number, name: string, terrain: Square['terrain']): Omit<Square, 'exits'> {
  return { id, name, terrain, squareType: 'land', landValue: 100 }
}

const TEMPLE_GROUNDS_SQUARES: Omit<Square, 'exits'>[] = [
  { id: 0, name: 'Castle', terrain: 'neutral', squareType: 'castle', landValue: 0 },
  land(1, 'Fire Path', 'fire'),
  land(2, 'Fire Path', 'fire'),
  { id: 3, name: 'Warp Gate', terrain: 'neutral', squareType: 'warp', landValue: 0, warpTo: 14 },
  land(4, 'Air Path', 'air'),
  land(5, 'Air Path', 'air'),
  land(6, 'Water Path', 'water'),
  land(7, 'Water Path', 'water'),
  { id: 8, name: 'Temple', terrain: 'neutral', squareType: 'temple', landValue: 0 },
  land(9, 'Earth Path', 'earth'),
  land(10, 'Earth Path', 'earth'),
  { id: 11, name: 'South Fort', terrain: 'neutral', squareType: 'fort', landValue: 0 },
  land(12, 'Fire Path', 'fire'),
  land(13, 'Fire Path', 'fire'),
  { id: 14, name: 'Warp Gate', terrain: 'neutral', squareType: 'warp', landValue: 0, warpTo: 3 },
  land(15, 'Air Path', 'air'),
  land(16, 'Air Path', 'air'),
  { id: 17, name: 'Fortune-Teller', terrain: 'neutral', squareType: 'fortune', landValue: 0 },
  land(18, 'Water Path', 'water'),
  land(19, 'Water Path', 'water'),
  land(20, 'Earth Path', 'earth'),
  land(21, 'Earth Path', 'earth')
]

export const TEMPLE_GROUNDS_BOARD: Square[] = withClockwiseExits(TEMPLE_GROUNDS_SQUARES)

export const TEMPLE_GROUNDS_CONFIG: GameConfig = {
  mapId: 'temple-grounds',
  mapName: 'Temple Grounds',
  targetMagic: 6000,
  startMagic: 200,
  lapMagic: 200,
  fortMagic: 100,
  maxDie: 6,
  handLimit: 6,
  maxLandLevel: 5,
  symbolValue: 50,
  board: TEMPLE_GROUNDS_BOARD
}
