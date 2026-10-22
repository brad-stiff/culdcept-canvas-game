import { COLOSSEUM_CONFIG } from '../../../shared/game/maps/colosseum'
import type { GameState, Player } from '../../../shared/game/types'
import { matchChromeKey, matchChromeModel } from './matchChrome'

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: `P${partial.id}`,
    color: '#4aa',
    magic: 200,
    position: 0,
    hand: [],
    book: [],
    discard: [],
    isAi: false,
    ...partial
  }
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    config: COLOSSEUM_CONFIG,
    players: [player({ id: 0, name: 'Alice' }), player({ id: 1, name: 'Bob', isAi: true })],
    currentPlayerIndex: 0,
    territories: [],
    phase: 'roll',
    lastRoll: null,
    log: ['Free Battle begins.', 'Alice draws a card.'],
    pendingAction: null,
    selectedSquareId: null,
    lastBattle: null,
    winnerId: null,
    pendingAttackerId: null,
    pendingSteps: 0,
    pathFromId: null,
    worldTexts: [],
    ...overrides
  }
}

describe('matchChromeModel', () => {
  it('lists cepters with liquid and total magic and whose turn it is', () => {
    const model = matchChromeModel(state(), 'Alice — roll')
    expect(model.players).toHaveLength(2)
    expect(model.players[0]).toMatchObject({
      name: 'Alice',
      magic: 200,
      total: 200,
      isTurn: true,
      isAi: false
    })
    expect(model.players[1].isTurn).toBe(false)
    expect(model.players[1].isAi).toBe(true)
    expect(model.mapName).toBe(COLOSSEUM_CONFIG.mapName)
    expect(model.goal).toBe(COLOSSEUM_CONFIG.targetMagic)
    expect(model.log).toEqual(['Free Battle begins.', 'Alice draws a card.'])
  })

  it('keeps the chrome key stable when nothing visible changed', () => {
    const a = matchChromeModel(state(), 'Alice — roll')
    const b = matchChromeModel(state(), 'Alice — roll')
    expect(matchChromeKey(a)).toBe(matchChromeKey(b))
  })

  it('changes the chrome key when magic or phase changes', () => {
    const a = matchChromeKey(matchChromeModel(state(), 'Alice — roll'))
    const b = matchChromeKey(matchChromeModel(state({ phase: 'landed' }), 'Alice — choose action'))
    const c = matchChromeKey(
      matchChromeModel(
        state({ players: [player({ id: 0, name: 'Alice', magic: 250 })] }),
        'Alice — roll'
      )
    )
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })
})
