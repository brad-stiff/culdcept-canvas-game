import type { GameConfig, Square } from '../types'

/**
 * Culdcept Saga — simple X / Crossroads Free Battle map.
 * Source: https://culdceptcentral.com/culdcept-saga/culdcept-saga-map-list
 *
 * 21 tiles, die 1–7, start/lap 200G, forts NSEW/100G, goal 6000G,
 * 4 of each element, no special lands.
 *
 * Castle at center, four arms of 4 lands + a fort at each tip.
 */
function land(id: number, name: string, terrain: Square['terrain'], exits: number[]): Square {
  return { id, name, terrain, squareType: 'land', landValue: 100, exits }
}

function fort(id: number, name: string, back: number): Square {
  return { id, name, terrain: 'neutral', squareType: 'fort', landValue: 0, exits: [back] }
}

export const CROSSROADS_BOARD: Square[] = [
  {
    id: 0,
    name: 'Castle',
    terrain: 'neutral',
    squareType: 'castle',
    landValue: 0,
    exits: [1, 6, 11, 16]
  },
  // North — Fire
  land(1, 'North Fire', 'fire', [0, 2]),
  land(2, 'North Fire', 'fire', [1, 3]),
  land(3, 'North Fire', 'fire', [2, 4]),
  land(4, 'North Fire', 'fire', [3, 5]),
  fort(5, 'North Fort', 4),
  // East — Air
  land(6, 'East Air', 'air', [0, 7]),
  land(7, 'East Air', 'air', [6, 8]),
  land(8, 'East Air', 'air', [7, 9]),
  land(9, 'East Air', 'air', [8, 10]),
  fort(10, 'East Fort', 9),
  // South — Water
  land(11, 'South Water', 'water', [0, 12]),
  land(12, 'South Water', 'water', [11, 13]),
  land(13, 'South Water', 'water', [12, 14]),
  land(14, 'South Water', 'water', [13, 15]),
  fort(15, 'South Fort', 14),
  // West — Earth
  land(16, 'West Earth', 'earth', [0, 17]),
  land(17, 'West Earth', 'earth', [16, 18]),
  land(18, 'West Earth', 'earth', [17, 19]),
  land(19, 'West Earth', 'earth', [18, 20]),
  fort(20, 'West Fort', 19)
]

const arm = (t: number, toward: 0 | 1): { x: number; y: number } => {
  // t=1..5 along an arm; toward 0 = N, 1 = E, then S=2 W=3 via caller
  const d = 0.09 * t
  return [
    { x: 0.5, y: 0.5 - d },
    { x: 0.5 + d, y: 0.5 },
    { x: 0.5, y: 0.5 + d },
    { x: 0.5 - d, y: 0.5 }
  ][toward]
}

export const CROSSROADS_LAYOUT: { x: number; y: number }[] = [
  { x: 0.5, y: 0.5 },
  arm(1, 0),
  arm(2, 0),
  arm(3, 0),
  arm(4, 0),
  arm(5, 0),
  arm(1, 1),
  arm(2, 1),
  arm(3, 1),
  arm(4, 1),
  arm(5, 1),
  { x: 0.5, y: 0.5 + 0.09 },
  { x: 0.5, y: 0.5 + 0.18 },
  { x: 0.5, y: 0.5 + 0.27 },
  { x: 0.5, y: 0.5 + 0.36 },
  { x: 0.5, y: 0.5 + 0.45 },
  { x: 0.5 - 0.09, y: 0.5 },
  { x: 0.5 - 0.18, y: 0.5 },
  { x: 0.5 - 0.27, y: 0.5 },
  { x: 0.5 - 0.36, y: 0.5 },
  { x: 0.5 - 0.45, y: 0.5 }
]

export const CROSSROADS_CONFIG: GameConfig = {
  mapId: 'crossroads',
  mapName: 'Crossroads',
  targetMagic: 6000,
  startMagic: 200,
  lapMagic: 200,
  fortMagic: 100,
  maxDie: 7,
  handLimit: 6,
  maxLandLevel: 5,
  symbolValue: 50,
  board: CROSSROADS_BOARD,
  layout: CROSSROADS_LAYOUT
}
