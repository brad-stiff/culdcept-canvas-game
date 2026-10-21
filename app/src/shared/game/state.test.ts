import { crossedStart } from './board'
import { resolveBattle } from './combat'
import { tollAmount, totalMagic } from './economy'
import { globalExtraDraw } from './globals'
import { COLOSSEUM_BOARD, COLOSSEUM_CONFIG } from './maps/colosseum'
import { getAvailableActions, reduceGame, startMatch } from './state'
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

  it('can start on Practice Field', () => {
    const state = startMatch(
      [
        { name: 'A', isAi: false },
        { name: 'B', isAi: true }
      ],
      { mapId: 'practice-field' }
    )
    expect(state.config.mapId).toBe('practice-field')
    expect(state.config.board).toHaveLength(18)
  })

  it('can start on Crossroads', () => {
    const state = startMatch(
      [
        { name: 'A', isAi: false },
        { name: 'B', isAi: true }
      ],
      { mapId: 'crossroads' }
    )
    expect(state.config.mapId).toBe('crossroads')
    expect(state.config.board).toHaveLength(21)
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
      expect(rolled.players[0].magic).toBeGreaterThanOrEqual(before + state.config.lapMagic)
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
    itemCategory: null,
    landLimits: [],
    itemLimits: [],
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

  it('applies instant death when ST covers defender HP', () => {
    const outcome = resolveBattle({
      attacker: creature({ name: 'Reaper', st: 40, hp: 20, keywords: ['instant_death'] }),
      defender: creature({ name: 'Pawn', st: 50, hp: 40 }),
      item: null,
      square: COLOSSEUM_BOARD[1],
      landLevel: 1
    })
    expect(outcome.attackerWins).toBe(true)
    expect(outcome.defenderRemainingHp).toBe(0)
  })

  it('ignores land bonus on scroll attack', () => {
    const outcome = resolveBattle({
      attacker: creature({ name: 'Mage', st: 30, hp: 20, element: 'fire', keywords: ['scroll_attack'] }),
      defender: creature({ name: 'Wall', st: 0, hp: 25 }),
      item: null,
      square: COLOSSEUM_BOARD[1], // fire land
      landLevel: 5
    })
    // Without land bonus (scroll), 30 ST kills 25 HP; with land would also win — assert no counter
    expect(outcome.attackerWins).toBe(true)
    expect(outcome.attackerRemainingHp).toBe(20)
  })
})

describe('totalMagic', () => {
  it('counts liquid magic toward the goal', () => {
    const state = startMatch(['Alice', 'Bob'])
    expect(totalMagic(state, state.players[0])).toBe(state.players[0].magic)
  })
})

function creature(
  partial: Partial<MatchCard> & Pick<MatchCard, 'name' | 'st' | 'hp'>
): MatchCard {
  return {
    instanceId: partial.name,
    catalogId: partial.name,
    kind: 'creature',
    element: 'fire',
    mhp: partial.hp,
    cost: 0,
    abilityText: '',
    keywords: [],
    itemBonusSt: 0,
    itemBonusHp: 0,
    itemCategory: null,
    landLimits: [],
    itemLimits: [],
    ...partial
  }
}

describe('Crossroads forks', () => {
  it('asks for a path when rolling from the castle', () => {
    const state = startMatch(
      [
        { name: 'A', isAi: false },
        { name: 'B', isAi: true }
      ],
      { mapId: 'crossroads' }
    )
    const rolled = reduceGame(state, { type: 'roll_dice' })
    expect(rolled.phase).toBe('choose_path')
    expect(rolled.pendingSteps).toBeGreaterThan(0)
    const chosen = reduceGame(rolled, { type: 'choose_path', squareId: 1 })
    expect(chosen.players[0].position).not.toBe(0)
  })
})

describe('territory commands', () => {
  it('moves a creature to an adjacent empty land', () => {
    let state = startMatch(['Alice', 'Bob'])
    const gob = creature({ name: 'Gob', st: 20, hp: 20, element: 'fire' })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1,
      territories: [{ squareId: 1, ownerId: 0, creature: gob, level: 1, tollHalved: false }]
    }
    expect(getAvailableActions(state)).toContain('move_creature')
    state = reduceGame(state, { type: 'choose_action', action: 'move_creature' })
    expect(state.phase).toBe('select_square')
    state = reduceGame(state, { type: 'select_square', squareId: 2 })
    expect(state.territories[0].squareId).toBe(2)
  })

  it('applies Fog to halve toll', () => {
    let state = startMatch(['Alice', 'Bob'])
    const fogger = creature({
      name: 'Mist',
      st: 10,
      hp: 20,
      keywords: ['territory_ability'],
      abilityText: 'Territory Ability: Fog = Target territory toll is reduced by 1/2.'
    })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1,
      territories: [{ squareId: 1, ownerId: 0, creature: fogger, level: 2, tollHalved: false }]
    }
    const before = tollAmount(state, 1)
    expect(getAvailableActions(state)).toContain('territory_ability')
    state = reduceGame(state, { type: 'choose_action', action: 'territory_ability' })
    expect(state.territories[0].tollHalved).toBe(true)
    expect(tollAmount(state, 1)).toBe(Math.floor(before / 2))
  })
})

describe('global abilities', () => {
  it('detects Brass-style extra draw', () => {
    const state = startMatch(['Alice', 'Bob'])
    const idol = creature({
      name: 'Brass Idol',
      st: 0,
      hp: 20,
      keywords: ['defensive', 'global'],
      abilityText: 'Defensive / Global Ability: All Cepters draw two cards when drawing instead of one.'
    })
    const withIdol = {
      ...state,
      territories: [{ squareId: 1, ownerId: 0, creature: idol, level: 1, tollHalved: false }]
    }
    expect(globalExtraDraw(withIdol)).toBe(true)
    expect(globalExtraDraw(state)).toBe(false)
  })
})
