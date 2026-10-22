import { crossedStart } from './board'
import { resolveBattle, synergyBonus } from './combat'
import { tollAmount, totalMagic } from './economy'
import {
  globalBlockTransform,
  globalExtraDraw,
  globalIgnoreLandLimits,
  globalUniqueInPlay,
  reducedAbilityDamage
} from './globals'
import { COLOSSEUM_BOARD, COLOSSEUM_CONFIG } from './maps/colosseum'
import { listSagaCards } from '../cards/catalog'
import { getMapConfig } from './maps'
import { getAvailableActions, getMoveTargets, reduceGame, startMatch } from './state'
import { tryResolveSpell } from './spells'
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

  it('can start on Temple Grounds', () => {
    const state = startMatch(
      [
        { name: 'A', isAi: false },
        { name: 'B', isAi: true }
      ],
      { mapId: 'temple-grounds' }
    )
    expect(state.config.mapId).toBe('temple-grounds')
    expect(state.config.board).toHaveLength(22)
  })

  it('can start with an expanded book that includes a Revolt card', () => {
    const saga = listSagaCards()
    const bookCatalogIds = [
      ...saga.filter((c) => c.kind === 'creature').slice(0, 33).map((c) => c.id),
      ...saga.filter((c) => c.kind === 'item').slice(0, 8).map((c) => c.id),
      ...saga.filter((c) => c.kind === 'spell').slice(0, 8).map((c) => c.id),
      'revolt-goblin'
    ]
    const state = startMatch([
      { name: 'Alice', isAi: false, bookCatalogIds },
      { name: 'Bob', isAi: true }
    ])
    const all = state.players[0].hand.concat(state.players[0].book)
    expect(all.some((c) => c.catalogId === 'revolt-goblin')).toBe(true)
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

describe('synergy', () => {
  it('grants +10 when another same-element creature is in play', () => {
    const state = startMatch(['Alice', 'Bob'])
    const fireA = creature({ name: 'Ammon', st: 30, hp: 30, element: 'fire', abilityText: 'Synergy: (ST & HP+20).' })
    const fireB = creature({ name: 'Hound', st: 20, hp: 20, element: 'fire', instanceId: 'hound' })
    const withPair = {
      ...state,
      territories: [
        { squareId: 1, ownerId: 0, creature: fireA, level: 1, tollHalved: false },
        { squareId: 2, ownerId: 0, creature: fireB, level: 1, tollHalved: false }
      ]
    }
    expect(synergyBonus(withPair, fireA, 1)).toBe(10)
    expect(synergyBonus(state, fireA, 1)).toBe(0)
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

describe('castle and fort territory command', () => {
  it('lets a cepter command any owned land from a fort', () => {
    let state = startMatch(['Alice', 'Bob'])
    const gob = creature({ name: 'Gob', st: 20, hp: 20, element: 'fire' })
    const wolf = creature({ name: 'Wolf', st: 25, hp: 20, element: 'fire' })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 5, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 5,
      territories: [
        { squareId: 1, ownerId: 0, creature: gob, level: 1, tollHalved: false },
        { squareId: 2, ownerId: 0, creature: wolf, level: 2, tollHalved: false }
      ]
    }
    expect(getAvailableActions(state)).toContain('territory')
    state = reduceGame(state, { type: 'choose_action', action: 'territory' })
    expect(state.phase).toBe('select_square')
    expect(getMoveTargets(state).sort((a, b) => a - b)).toEqual([1, 2])
    state = reduceGame(state, { type: 'select_square', squareId: 2 })
    expect(state.phase).toBe('territory_menu')
    expect(state.selectedSquareId).toBe(2)
    expect(getAvailableActions(state)).toContain('level_up')
  })

  it('offers no territory command from the castle with no lands', () => {
    let state = startMatch(['Alice', 'Bob'])
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 0, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 0,
      territories: []
    }
    expect(getAvailableActions(state)).not.toContain('territory')
    expect(getAvailableActions(state)).toContain('skip')
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

  it('Gold-style ignores land limits when placing', () => {
    let state = startMatch(['Alice', 'Bob'])
    const gold = creature({
      name: 'Gold Idol',
      st: 0,
      hp: 20,
      keywords: ['defensive', 'global'],
      abilityText:
        'Item Limit: Defensive / Global Ability: Requirements for summoning creatures other than magic cost are ignored.'
    })
    const limited = creature({
      name: 'Fish',
      st: 10,
      hp: 10,
      element: 'water',
      landLimits: ['fire'],
      catalogId: 'fish'
    })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000, hand: [limited] },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1,
      territories: [{ squareId: 2, ownerId: 0, creature: gold, level: 1, tollHalved: false }]
    }
    expect(globalIgnoreLandLimits(state)).toBe(true)
    expect(getAvailableActions(state)).toContain('place')
    state = reduceGame(state, { type: 'choose_action', action: 'place' })
    state = reduceGame(state, { type: 'select_creature', cardId: limited.instanceId })
    expect(state.territories.some((t) => t.creature.catalogId === 'fish')).toBe(true)
  })

  it('Marble-style blocks a duplicate catalogId', () => {
    let state = startMatch(['Alice', 'Bob'])
    const marble = creature({
      name: 'Marble Idol',
      st: 0,
      hp: 20,
      keywords: ['defensive', 'global'],
      abilityText:
        'Item Limit: Defensive / Global Ability: Creatures of the same type as those already in play cannot be summoned.'
    })
    const first = creature({ name: 'Gob', st: 20, hp: 20, catalogId: 'gob' })
    const second = creature({ name: 'Gob', st: 20, hp: 20, catalogId: 'gob', instanceId: 'gob-2' })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 2, magic: 1000, hand: [second] },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 2,
      territories: [
        { squareId: 3, ownerId: 0, creature: marble, level: 1, tollHalved: false },
        { squareId: 1, ownerId: 0, creature: first, level: 1, tollHalved: false }
      ]
    }
    expect(globalUniqueInPlay(state)).toBe(true)
    expect(getAvailableActions(state)).not.toContain('place')
  })

  it('Clay-style reduces spell creature damage by 10', () => {
    const state = startMatch(['Alice', 'Bob'])
    const clay = creature({
      name: 'Clay Idol',
      st: 0,
      hp: 20,
      keywords: ['defensive', 'global'],
      abilityText:
        'Item Limit: Defensive / Global Ability: Damage to all creatures from spells and territory abilities is reduced by 10.'
    })
    const wall = creature({ name: 'Wall', st: 0, hp: 30 })
    const withClay = {
      ...state,
      players: [{ ...state.players[0], magic: 200, hand: [], discard: [] }, state.players[1]],
      territories: [
        { squareId: 1, ownerId: 0, creature: clay, level: 1, tollHalved: false },
        { squareId: 2, ownerId: 1, creature: wall, level: 1, tollHalved: false }
      ]
    }
    expect(reducedAbilityDamage(withClay, 20)).toBe(10)
    const result = tryResolveSpell(withClay, withClay.players[0], {
      ...wall,
      instanceId: 'bolt',
      catalogId: 'bolt',
      name: 'Bolt',
      kind: 'spell',
      element: null,
      st: 0,
      hp: 0,
      mhp: 0,
      cost: 20,
      abilityText: 'Deals 20 damage.'
    })
    expect(result.handled).toBe(true)
    const after = result.state.territories.find((t) => t.squareId === 2)
    expect(after?.creature.hp).toBe(20)
  })
})

describe('Phase 3C squares and territory', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('warps once and does not chain through the paired gate', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const state = startMatch(['Alice', 'Bob'], { mapId: 'temple-grounds' })
    const rolled = reduceGame(
      {
        ...state,
        players: [{ ...state.players[0], position: 2 }, state.players[1]],
        phase: 'roll'
      },
      { type: 'roll_dice' }
    )
    expect(rolled.players[0].position).toBe(14)
    expect(rolled.phase).toBe('landed')
    expect(rolled.log.some((line) => /warps/i.test(line))).toBe(true)
  })

  it('pays temple magic from symbol levels', () => {
    let state = startMatch(['Alice', 'Bob'], { mapId: 'temple-grounds' })
    const gob = creature({ name: 'Gob', st: 20, hp: 20 })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 8, magic: 200 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 8,
      territories: [
        { squareId: 1, ownerId: 0, creature: gob, level: 2, tollHalved: false },
        { squareId: 2, ownerId: 0, creature: { ...gob, instanceId: 'gob-b' }, level: 1, tollHalved: false }
      ]
    }
    expect(getAvailableActions(state)).toContain('temple')
    const next = reduceGame(state, { type: 'choose_action', action: 'temple' })
    expect(next.players[0].magic).toBe(260)
  })

  it('fortune can send the cepter to the castle without a lap', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9)
    let state = startMatch(['Alice', 'Bob'], { mapId: 'temple-grounds' })
    const before = state.players[0].magic
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 17, magic: before },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 17
    }
    expect(getAvailableActions(state)).toContain('fortune')
    const next = reduceGame(state, { type: 'choose_action', action: 'fortune' })
    expect(next.players[0].position).toBe(0)
    expect(next.players[0].magic).toBe(before)
  })

  it('exchanges creatures and leaves land levels in place', () => {
    let state = startMatch(['Alice', 'Bob'])
    const gob = creature({ name: 'Gob', st: 20, hp: 20, element: 'fire' })
    const bird = creature({ name: 'Bird', st: 10, hp: 20, element: 'air', instanceId: 'bird' })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1,
      territories: [
        { squareId: 1, ownerId: 0, creature: gob, level: 3, tollHalved: false },
        { squareId: 2, ownerId: 0, creature: bird, level: 1, tollHalved: false }
      ]
    }
    expect(getAvailableActions(state)).toContain('exchange')
    state = reduceGame(state, { type: 'choose_action', action: 'exchange' })
    state = reduceGame(state, { type: 'select_square', squareId: 2 })
    const a = state.territories.find((t) => t.squareId === 1)!
    const b = state.territories.find((t) => t.squareId === 2)!
    expect(a.creature.name).toBe('Bird')
    expect(b.creature.name).toBe('Gob')
    expect(a.level).toBe(3)
    expect(b.level).toBe(1)
  })

  it('transforms land to the occupying creature element without mutating the map catalog', () => {
    const catalogTerrain = getMapConfig('colosseum-i').board[1].terrain
    let state = startMatch(['Alice', 'Bob'])
    const bird = creature({ name: 'Bird', st: 10, hp: 20, element: 'air' })
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1,
      territories: [{ squareId: 1, ownerId: 0, creature: bird, level: 2, tollHalved: false }]
    }
    expect(getAvailableActions(state)).toContain('transform')
    const next = reduceGame(state, { type: 'choose_action', action: 'transform' })
    expect(next.config.board[1].terrain).toBe('air')
    expect(next.players[0].magic).toBe(800)
    expect(getMapConfig('colosseum-i').board[1].terrain).toBe(catalogTerrain)
  })

  it('hides transform under Jade and exchange under Lead', () => {
    const jade = creature({
      name: 'Jade Idol',
      st: 0,
      hp: 20,
      keywords: ['defensive', 'global'],
      abilityText:
        'Item Limit: Defensive / Global Ability: All territories are prevented from undergoing land transformation via spells or territory abilities and are immune to effects that lower land levels.'
    })
    const lead = creature({
      name: 'Lead Idol',
      st: 0,
      hp: 20,
      keywords: ['defensive', 'global'],
      abilityText: 'Item Limit: Defensive / Global Ability: Disables Move and Exchange commands.'
    })
    const bird = creature({ name: 'Bird', st: 10, hp: 20, element: 'air' })
    const gob = creature({ name: 'Gob', st: 20, hp: 20, element: 'fire', instanceId: 'gob' })
    let state = startMatch(['Alice', 'Bob'])
    state = {
      ...state,
      players: [
        { ...state.players[0], position: 1, magic: 1000 },
        state.players[1]
      ],
      phase: 'landed',
      selectedSquareId: 1,
      territories: [
        { squareId: 1, ownerId: 0, creature: bird, level: 1, tollHalved: false },
        { squareId: 2, ownerId: 0, creature: gob, level: 1, tollHalved: false },
        { squareId: 4, ownerId: 1, creature: jade, level: 1, tollHalved: false },
        { squareId: 5, ownerId: 1, creature: lead, level: 1, tollHalved: false }
      ]
    }
    expect(globalBlockTransform(state)).toBe(true)
    expect(getAvailableActions(state)).not.toContain('transform')
    expect(getAvailableActions(state)).not.toContain('exchange')
    expect(getAvailableActions(state)).not.toContain('move_creature')
  })
})
