import { getMapConfig, listMaps } from './index'
import { PRACTICE_FIELD_BOARD, PRACTICE_FIELD_CONFIG } from './practiceField'

describe('map registry', () => {
  it('lists Colosseum and Practice Field', () => {
    const ids = listMaps().map((m) => m.mapId)
    expect(ids).toEqual(expect.arrayContaining(['colosseum-i', 'practice-field']))
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
})
