import { getMapConfig, listMaps } from './index'
import { CROSSROADS_BOARD, CROSSROADS_CONFIG } from './crossroads'
import { PRACTICE_FIELD_BOARD, PRACTICE_FIELD_CONFIG } from './practiceField'
import { TEMPLE_GROUNDS_BOARD, TEMPLE_GROUNDS_CONFIG } from './templeGrounds'

describe('map registry', () => {
  it('lists Colosseum, Practice Field, Crossroads, and Temple Grounds', () => {
    const ids = listMaps().map((m) => m.mapId)
    expect(ids).toEqual(
      expect.arrayContaining(['colosseum-i', 'practice-field', 'crossroads', 'temple-grounds'])
    )
  })

  it('Practice Field matches Free Battle simple-loop stats', () => {
    expect(PRACTICE_FIELD_BOARD).toHaveLength(18)
    expect(PRACTICE_FIELD_CONFIG.targetMagic).toBe(5000)
    expect(PRACTICE_FIELD_CONFIG.fortMagic).toBe(100)
    expect(PRACTICE_FIELD_CONFIG.maxDie).toBe(6)
    const lands = PRACTICE_FIELD_BOARD.filter((s) => s.squareType === 'land')
    expect(lands.filter((s) => s.terrain === 'fire')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'water')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'earth')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'air')).toHaveLength(4)
    expect(PRACTICE_FIELD_BOARD.filter((s) => s.squareType === 'fort')).toHaveLength(1)
    expect(PRACTICE_FIELD_BOARD.filter((s) => s.squareType === 'shrine')).toHaveLength(0)
  })

  it('startMatch can use Practice Field via getMapConfig', () => {
    expect(getMapConfig('practice-field').mapName).toBe('Practice Field')
  })

  it('Crossroads matches simple X-map stats', () => {
    expect(CROSSROADS_BOARD).toHaveLength(21)
    expect(CROSSROADS_CONFIG.targetMagic).toBe(6000)
    expect(CROSSROADS_CONFIG.maxDie).toBe(7)
    expect(CROSSROADS_CONFIG.fortMagic).toBe(100)
    const lands = CROSSROADS_BOARD.filter((s) => s.squareType === 'land')
    expect(lands.filter((s) => s.terrain === 'fire')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'water')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'earth')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'air')).toHaveLength(4)
    expect(CROSSROADS_BOARD.filter((s) => s.squareType === 'fort')).toHaveLength(4)
    expect(CROSSROADS_BOARD[0].exits).toHaveLength(4)
  })

  it('Temple Grounds is a 22-tile temple loop with a warp pair', () => {
    expect(TEMPLE_GROUNDS_BOARD).toHaveLength(22)
    expect(TEMPLE_GROUNDS_CONFIG.targetMagic).toBe(6000)
    expect(TEMPLE_GROUNDS_CONFIG.maxDie).toBe(6)
    expect(TEMPLE_GROUNDS_CONFIG.fortMagic).toBe(100)
    expect(TEMPLE_GROUNDS_CONFIG.lapMagic).toBe(200)
    const lands = TEMPLE_GROUNDS_BOARD.filter((s) => s.squareType === 'land')
    expect(lands.filter((s) => s.terrain === 'fire')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'water')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'earth')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'air')).toHaveLength(4)
    expect(TEMPLE_GROUNDS_BOARD.filter((s) => s.squareType === 'temple')).toHaveLength(1)
    expect(TEMPLE_GROUNDS_BOARD.filter((s) => s.squareType === 'fortune')).toHaveLength(1)
    expect(TEMPLE_GROUNDS_BOARD.filter((s) => s.squareType === 'fort')).toHaveLength(1)
    const warps = TEMPLE_GROUNDS_BOARD.filter((s) => s.squareType === 'warp')
    expect(warps).toHaveLength(2)
    expect(warps[0].warpTo).toBe(warps[1].id)
    expect(warps[1].warpTo).toBe(warps[0].id)
    expect(getMapConfig('temple-grounds').mapName).toBe('Temple Grounds')
  })
})
