import { pathChoices, walkPath } from './board'
import { CROSSROADS_BOARD } from './maps/crossroads'
import { COLOSSEUM_BOARD } from './maps/colosseum'

describe('graph movement', () => {
  it('walks Colosseum as a single-exit loop without forking', () => {
    const walk = walkPath(COLOSSEUM_BOARD, 0, 4, null)
    expect(walk.kind).toBe('land')
    if (walk.kind === 'land') {
      expect(walk.position).toBe(4)
      expect(walk.crossedCastle).toBe(false)
    }
  })

  it('awards castle crossing on the Colosseum loop', () => {
    const walk = walkPath(COLOSSEUM_BOARD, 19, 2, null)
    expect(walk.kind).toBe('land')
    if (walk.kind === 'land') {
      expect(walk.position).toBe(1)
      expect(walk.crossedCastle).toBe(true)
    }
  })

  it('pauses at Crossroads castle for a path choice', () => {
    const walk = walkPath(CROSSROADS_BOARD, 0, 3, null)
    expect(walk.kind).toBe('fork')
    if (walk.kind === 'fork') {
      expect(walk.position).toBe(0)
      expect(walk.remaining).toBe(3)
      expect(walk.choices).toEqual([1, 6, 11, 16])
    }
  })

  it('filters the arrival arm when leaving castle', () => {
    const castle = CROSSROADS_BOARD[0]
    expect(pathChoices(castle, 1)).toEqual([6, 11, 16])
  })
})
