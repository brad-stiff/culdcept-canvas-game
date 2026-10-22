import { combatViewFromState, preFightStats, resolveBattle } from './combat'
import { COLOSSEUM_BOARD, COLOSSEUM_CONFIG } from './maps/colosseum'
import type { GameState, MatchCard, Player, Territory } from './types'

function creature(partial: Partial<MatchCard> & Pick<MatchCard, 'name' | 'st' | 'hp'>): MatchCard {
  return {
    instanceId: partial.instanceId ?? partial.name,
    catalogId: partial.catalogId ?? partial.name,
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

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: `P${partial.id}`,
    color: '#fff',
    magic: 400,
    position: 1,
    hand: [],
    book: [],
    discard: [],
    isAi: false,
    ...partial
  }
}

describe('resolveBattle presentation', () => {
  it('keeps combatant snapshots and pre-fight ST/HP', () => {
    const attacker = creature({ name: 'Brute', st: 50, hp: 40, keywords: ['attacks_first'] })
    const defender = creature({ name: 'Wall', st: 10, hp: 30 })
    const outcome = resolveBattle({
      attacker,
      defender,
      item: null,
      square: COLOSSEUM_BOARD[1],
      landLevel: 1
    })
    expect(outcome.attacker.name).toBe('Brute')
    expect(outcome.defender.name).toBe('Wall')
    expect(outcome.attackerSt).toBeGreaterThanOrEqual(50)
    expect(outcome.attackerHp).toBeGreaterThanOrEqual(40)
    expect(outcome.squareName).toBe(COLOSSEUM_BOARD[1].name)
    expect(outcome.attackerWins).toBe(true)
  })

  it('adds land bonus to pre-fight stats unless scroll', () => {
    const ants = {
      attacker: creature({ name: 'Mage', st: 20, hp: 20, element: 'fire' as const }),
      defender: creature({ name: 'Wall', st: 10, hp: 20, element: 'water' as const }),
      item: null,
      square: COLOSSEUM_BOARD[1],
      landLevel: 2
    }
    const land = preFightStats(ants)
    const scroll = preFightStats({
      ...ants,
      attacker: creature({
        name: 'Mage',
        st: 20,
        hp: 20,
        element: 'fire',
        keywords: ['scroll_attack']
      })
    })
    expect(land.attackerSt).toBeGreaterThan(scroll.attackerSt)
  })
})

describe('combatViewFromState', () => {
  it('previews invader vs defender while choosing an item', () => {
    const invader = creature({ name: 'Goblin', st: 20, hp: 30, instanceId: 'atk' })
    const guard = creature({ name: 'Golem', st: 15, hp: 40, instanceId: 'def' })
    const terr: Territory = {
      squareId: 1,
      ownerId: 1,
      creature: guard,
      level: 2,
      tollHalved: false
    }
    const state: GameState = {
      config: COLOSSEUM_CONFIG,
      players: [player({ id: 0, hand: [invader], position: 1 }), player({ id: 1, position: 8 })],
      currentPlayerIndex: 0,
      territories: [terr],
      phase: 'select_item',
      lastRoll: 4,
      log: [],
      pendingAction: 'battle',
      selectedSquareId: 1,
      lastBattle: null,
      winnerId: null,
      pendingAttackerId: 'atk',
      pendingSteps: 0,
      pathFromId: 0,
      worldTexts: []
    }
    const view = combatViewFromState(state, null)
    expect(view?.resolved).toBe(false)
    expect(view?.attacker.name).toBe('Goblin')
    expect(view?.defender.name).toBe('Golem')
    expect(view?.landLevel).toBe(2)
    expect(view?.attackerRemainingHp).toBe(view?.attackerHp)
  })
})
