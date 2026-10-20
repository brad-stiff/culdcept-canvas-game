import { crossedStart } from './board'
import { resolveBattle } from './combat'
import { totalMagic } from './economy'
import { COLOSSEUM_BOARD, COLOSSEUM_CONFIG } from './maps/colosseum'
import { reduceGame, startMatch } from './state'
import type { MatchCard } from './types'

describe('Colosseum map', () => {
  it('matches Central Colosseum I land counts', () => {
    expect(COLOSSEUM_BOARD).toHaveLength(20)
    expect(COLOSSEUM_CONFIG.targetMagic).toBe(5000)
    expect(COLOSSEUM_CONFIG.maxDie).toBe(6)
    const lands = COLOSSEUM_BOARD.filter((s) => s.squareType === 'land')
    expect(lands.filter((s) => s.terrain === 'fire')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'water')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'earth')).toHaveLength(4)
    expect(lands.filter((s) => s.terrain === 'air')).toHaveLength(4)
    expect(COLOSSEUM_BOARD.filter((s) => s.squareType === 'shrine')).toHaveLength(1)
    expect(COLOSSEUM_BOARD.filter((s) => s.squareType === 'fort')).toHaveLength(2)
  })
})

describe('startMatch', () => {
  it('starts on roll with books and opening hands', () => {
    const state = startMatch([
      { name: 'Alice', isAi: false },
      { name: 'Bob', isAi: true }
    ])
    expect(state.phase).toBe('roll')
    expect(state.players[0].hand.length).toBeGreaterThanOrEqual(4)
    expect(state.players[0].book.length).toBeGreaterThan(0)
    expect(state.players[1].isAi).toBe(true)
    expect(state.config.mapId).toBe('colosseum-i')
  })

  it('supports up to four cepters', () => {
    const state = startMatch([
      { name: 'A', isAi: false },
      { name: 'B', isAi: false },
      { name: 'C', isAi: true },
      { name: 'D', isAi: true }
    ])
    expect(state.players).toHaveLength(4)
    expect(state.players.map((p) => p.id)).toEqual([0, 1, 2, 3])
  })
})

describe('crossedStart', () => {
  it('detects a lap around the board', () => {
    expect(crossedStart(19, 1)).toBe(true)
    expect(crossedStart(0, 3)).toBe(false)
  })
})

describe('reduceGame movement', () => {
  it('awards lap magic when movement crosses the castle', () => {
    const state = startMatch(['Alice', 'Bob'])
    const before = state.players[0].magic
    const rolled = reduceGame(
      {
        ...state,
        players: [{ ...state.players[0], position: 19 }, state.players[1]],
        phase: 'roll'
      },
      { type: 'roll_dice' }
    )
    expect(rolled.players[0].magic).toBeGreaterThanOrEqual(before)
    if (rolled.players[0].position < 19) {
      expect(rolled.players[0].magic).toBe(before + state.config.lapMagic)
    }
  })
})

describe('reduceGame territory', () => {
  it('places a creature on an empty land square', () => {
    let state = startMatch(['Alice', 'Bob'])
    const creature = state.players[0].hand.find((c) => c.kind === 'creature')
    expect(creature).toBeTruthy()
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1
    }

    state = reduceGame(state, { type: 'choose_action', action: 'place' })
    state = reduceGame(state, { type: 'select_creature', cardId: creature!.instanceId })

    expect(state.territories).toHaveLength(1)
    expect(state.territories[0].squareId).toBe(1)
    expect(state.territories[0].ownerId).toBe(0)
    expect(state.territories[0].level).toBe(1)
  })
})

describe('resolveBattle', () => {
  const creature = (partial: Partial<MatchCard> & Pick<MatchCard, 'name' | 'st' | 'hp'>): MatchCard => ({
    instanceId: partial.name,
    catalogId: partial.name,
    kind: 'creature',
    element: 'neutral',
    mhp: partial.hp,
    cost: 0,
    abilityText: '',
    keywords: [],
    itemBonusSt: 0,
    itemBonusHp: 0,
    ...partial
  })

  it('lets a stronger attacker win with attacks first', () => {
    const outcome = resolveBattle({
      attacker: creature({ name: 'Brute', st: 50, hp: 40, keywords: ['attacks_first'] }),
      defender: creature({ name: 'Wall', st: 10, hp: 30 }),
      item: null,
      square: COLOSSEUM_BOARD[1],
      landLevel: 1
    })
    expect(outcome.attackerWins).toBe(true)
  })
})

describe('totalMagic', () => {
  it('counts liquid magic toward the goal', () => {
    const state = startMatch(['Alice', 'Bob'])
    expect(totalMagic(state, state.players[0])).toBe(state.players[0].magic)
  })
})
