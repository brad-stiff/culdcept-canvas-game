import type { Square } from './types'

/** Compact loop board for the MVP skirmish. */
export const MVP_BOARD: Square[] = [
  {
    id: 0,
    name: 'Castle',
    terrain: 'neutral',
    squareType: 'castle',
    tollBase: 0
  },
  {
    id: 1,
    name: 'Ember Path',
    terrain: 'fire',
    squareType: 'land',
    tollBase: 80
  },
  {
    id: 2,
    name: 'Crossroads',
    terrain: 'neutral',
    squareType: 'land',
    tollBase: 60
  },
  {
    id: 3,
    name: 'Tide Shore',
    terrain: 'water',
    squareType: 'land',
    tollBase: 80
  },
  {
    id: 4,
    name: 'Market',
    terrain: 'neutral',
    squareType: 'land',
    tollBase: 70
  },
  {
    id: 5,
    name: 'Stone Ridge',
    terrain: 'earth',
    squareType: 'land',
    tollBase: 80
  },
  {
    id: 6,
    name: 'Sky Bridge',
    terrain: 'air',
    squareType: 'land',
    tollBase: 80
  },
  {
    id: 7,
    name: 'Old Gate',
    terrain: 'neutral',
    squareType: 'land',
    tollBase: 60
  }
]

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
