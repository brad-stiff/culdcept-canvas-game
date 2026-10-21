import { movementPlan } from './motion'
import { COLOSSEUM_CONFIG } from '../../../shared/game/maps/colosseum'
import { CROSSROADS_CONFIG } from '../../../shared/game/maps/crossroads'
import type { GameState, Player } from '../../../shared/game/types'

function player(partial: Partial<Player> & Pick<Player, 'id' | 'position'>): Player {
  return {
    name: `P${partial.id}`,
    color: '#fff',
    magic: 200,
    hand: [],
    book: [],
    discard: [],
    isAi: false,
    ...partial
  }
}

function base(config: GameState['config'], pos: number, phase: GameState['phase']): GameState {
  return {
    config,
    players: [player({ id: 0, position: pos })],
    currentPlayerIndex: 0,
    territories: [],
    phase,
    lastRoll: null,
    log: [],
    pendingAction: null,
    selectedSquareId: pos,
    lastBattle: null,
    winnerId: null,
    pendingAttackerId: null,
    pendingSteps: 0,
    pathFromId: null,
    worldTexts: []
  }
}

describe('movementPlan', () => {
  it('builds a Colosseum roll path and dice result', () => {
    const prev = base(COLOSSEUM_CONFIG, 0, 'roll')
    const next: GameState = {
      ...base(COLOSSEUM_CONFIG, 4, 'landed'),
      lastRoll: 4
    }
    const plan = movementPlan(prev, next)
    expect(plan).toEqual({
      playerId: 0,
      fromId: 0,
      path: [1, 2, 3, 4],
      dice: { result: 4, maxDie: 6 }
    })
  })

  it('shows the die at a Crossroads castle fork without walking yet', () => {
    const prev = base(CROSSROADS_CONFIG, 0, 'roll')
    const next: GameState = {
      ...base(CROSSROADS_CONFIG, 0, 'choose_path'),
      lastRoll: 5,
      pendingSteps: 5
    }
    expect(movementPlan(prev, next)).toEqual({
      playerId: 0,
      fromId: 0,
      path: [],
      dice: { result: 5, maxDie: 7 }
    })
  })

  it('does not animate when nothing moved', () => {
    const prev = base(COLOSSEUM_CONFIG, 3, 'landed')
    const next = base(COLOSSEUM_CONFIG, 3, 'landed')
    expect(movementPlan(prev, next)).toBeNull()
  })

  it('walks a Crossroads path choice without a new die', () => {
    const prev: GameState = {
      ...base(CROSSROADS_CONFIG, 0, 'choose_path'),
      lastRoll: 3,
      pendingSteps: 3,
      pathFromId: null
    }
    const next: GameState = {
      ...base(CROSSROADS_CONFIG, 3, 'landed'),
      lastRoll: 3,
      pendingSteps: 0,
      pathFromId: 2
    }
    const plan = movementPlan(prev, next)
    expect(plan?.dice).toBeNull()
    expect(plan?.fromId).toBe(0)
    expect(plan?.path[0]).toBe(1)
    expect(plan?.path[plan.path.length - 1]).toBe(3)
  })
})
