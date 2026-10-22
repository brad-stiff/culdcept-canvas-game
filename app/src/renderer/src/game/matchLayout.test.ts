import { COLOSSEUM_CONFIG } from '../../../shared/game/maps/colosseum'
import type { GameState, MatchCard, Player, Territory } from '../../../shared/game/types'
import {
  cardInHandAt,
  handLayout,
  inspectTargetAt,
  squareHitSize,
  territoryAtPoint
} from './matchLayout'

function card(
  partial: Partial<MatchCard> & Pick<MatchCard, 'instanceId' | 'catalogId' | 'name'>
): MatchCard {
  return {
    kind: 'creature',
    element: 'fire',
    st: 20,
    hp: 30,
    mhp: 30,
    cost: 20,
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
    magic: 200,
    position: 0,
    hand: [],
    book: [],
    discard: [],
    isAi: false,
    ...partial
  }
}

function stateWith(hand: MatchCard[], territories: Territory[]): GameState {
  return {
    config: COLOSSEUM_CONFIG,
    players: [player({ id: 0, hand })],
    currentPlayerIndex: 0,
    territories,
    phase: 'landed',
    lastRoll: 3,
    log: [],
    pendingAction: null,
    selectedSquareId: 3,
    lastBattle: null,
    winnerId: null,
    pendingAttackerId: null,
    pendingSteps: 0,
    pathFromId: 2,
    worldTexts: []
  }
}

describe('matchLayout', () => {
  it('lays the hand out above the action bar', () => {
    const layout = handLayout(4, 800, 600)
    expect(layout.y + layout.cardH).toBe(600 - 56)
    expect(layout.startX).toBeGreaterThan(0)
  })

  it('hits a hand card from canvas coordinates', () => {
    const goblin = card({ instanceId: 'a', catalogId: 'goblin', name: 'Goblin' })
    const layout = handLayout(1, 800, 600)
    const found = cardInHandAt([goblin], 800, 600, layout.startX + 10, layout.y + 10)
    expect(found?.instanceId).toBe('a')
    expect(cardInHandAt([goblin], 800, 600, 4, 4)).toBeNull()
  })

  it('hits an occupied land and builds an inspect target', () => {
    const creature = card({ instanceId: 'c', catalogId: 'salamander', name: 'Salamander' })
    const terr: Territory = {
      squareId: 1,
      ownerId: 0,
      creature,
      level: 2,
      tollHalved: false
    }
    const layout = {
      width: 800,
      height: 600,
      squarePositions: COLOSSEUM_CONFIG.board.map((_, i) => ({ x: 40 + i * 10, y: 120 }))
    }
    const game = stateWith([], [terr])
    const size = squareHitSize(layout)
    const pos = layout.squarePositions[1]
    expect(territoryAtPoint(game, layout, pos.x, pos.y)?.squareId).toBe(1)
    const target = inspectTargetAt(game, layout, 800, 600, pos.x, pos.y)
    expect(target?.kind).toBe('land')
    if (target?.kind === 'land') {
      expect(target.territory.level).toBe(2)
      expect(target.square.id).toBe(1)
    }
    expect(size).toBeGreaterThanOrEqual(40)
  })
})
