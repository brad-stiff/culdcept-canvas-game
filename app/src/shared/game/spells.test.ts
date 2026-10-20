import { tryResolveSpell } from './spells'
import { startMatch } from './state'
import type { MatchCard } from './types'

function spell(partial: Partial<MatchCard> & Pick<MatchCard, 'name' | 'abilityText' | 'cost'>): MatchCard {
  return {
    instanceId: partial.name,
    catalogId: partial.name,
    kind: 'spell',
    element: null,
    st: 0,
    hp: 0,
    mhp: 0,
    keywords: [],
    itemBonusSt: 0,
    itemBonusHp: 0,
    itemCategory: null,
    landLimits: [],
    itemLimits: [],
    ...partial
  }
}

describe('tryResolveSpell 3A', () => {
  it('gains magic', () => {
    const state = startMatch(['Alice', 'Bob'])
    const caster = { ...state.players[0], magic: 500, hand: [], discard: [] }
    const result = tryResolveSpell(state, caster, spell({ name: 'Coin', abilityText: 'User gains 100G.', cost: 20 }))
    expect(result.handled).toBe(true)
    expect(result.state.players[0].magic).toBe(580)
  })

  it('steals magic from enemies', () => {
    const state = startMatch(['Alice', 'Bob'])
    const withMagic = {
      ...state,
      players: [
        { ...state.players[0], magic: 200, hand: [], discard: [] },
        { ...state.players[1], magic: 150 }
      ]
    }
    const result = tryResolveSpell(
      withMagic,
      withMagic.players[0],
      spell({ name: 'Theft', abilityText: 'Steals 80G from enemy Cepter.', cost: 10 })
    )
    expect(result.state.players[0].magic).toBe(270)
    expect(result.state.players[1].magic).toBe(70)
  })

  it('destroys weakest enemy creature', () => {
    const state = startMatch(['Alice', 'Bob'])
    const creature: MatchCard = {
      instanceId: 'gob',
      catalogId: 'gob',
      name: 'Goblin',
      kind: 'creature',
      element: 'fire',
      st: 20,
      hp: 20,
      mhp: 20,
      cost: 20,
      abilityText: '',
      keywords: [],
      itemBonusSt: 0,
      itemBonusHp: 0,
      itemCategory: null,
      landLimits: [],
      itemLimits: []
    }
    const withTerr = {
      ...state,
      players: [{ ...state.players[0], magic: 200, hand: [], discard: [] }, state.players[1]],
      territories: [{ squareId: 1, ownerId: 1, creature, level: 1 }]
    }
    const result = tryResolveSpell(
      withTerr,
      withTerr.players[0],
      spell({ name: 'Ruin', abilityText: 'Destroys target enemy creature.', cost: 40 })
    )
    expect(result.state.territories).toHaveLength(0)
  })
})
