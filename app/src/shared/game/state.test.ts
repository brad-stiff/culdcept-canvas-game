import { crossedStart } from './board'
import {
  computeAttackPower,
  computeDefensePower,
  elementAdvantageBonus,
  resolveBattle
} from './combat'
import { createInitialState, reduceGame } from './state'

describe('createInitialState', () => {
  it('starts both players on the castle with starter hands', () => {
    const state = createInitialState(['Alice', 'Bob'])
    expect(state.players[0].name).toBe('Alice')
    expect(state.players[1].name).toBe('Bob')
    expect(state.players[0].position).toBe(0)
    expect(state.players[1].position).toBe(0)
    expect(state.players[0].hand).toHaveLength(5)
    expect(state.phase).toBe('roll')
  })
})

describe('crossedStart', () => {
  it('detects a lap around the board', () => {
    expect(crossedStart(7, 1)).toBe(true)
    expect(crossedStart(0, 3)).toBe(false)
  })
})

describe('reduceGame movement', () => {
  it('awards pass-castle gold when movement crosses the start square', () => {
    const state = createInitialState(['Alice', 'Bob'])
    const rolled = reduceGame(
      {
        ...state,
        players: [{ ...state.players[0], position: 7 }, state.players[1]],
        phase: 'roll'
      },
      { type: 'roll_dice' }
    )
    expect(rolled.players[0].gold).toBe(state.config.startGold + state.config.passCastleGold)
  })
})

describe('reduceGame territory', () => {
  it('places a creature on an empty land square', () => {
    let state = createInitialState(['Alice', 'Bob'])
    state = {
      ...state,
      players: [{ ...state.players[0], position: 1, gold: 1000 }, state.players[1]],
      phase: 'landed',
      selectedSquareId: 1
    }

    const cardId = state.players[0].hand[0].id
    state = reduceGame(state, { type: 'choose_action', action: 'place' })
    state = reduceGame(state, { type: 'select_creature', cardId })

    expect(state.territories).toHaveLength(1)
    expect(state.territories[0].squareId).toBe(1)
    expect(state.territories[0].ownerId).toBe(0)
    expect(state.currentPlayerIndex).toBe(1)
  })
})

describe('resolveBattle', () => {
  it('favors higher attack over defense on neutral terrain', () => {
    const outcome = resolveBattle(
      { id: 'a', name: 'Brute', cost: 0, attack: 100, defense: 10, element: 'neutral' },
      { id: 'b', name: 'Wall', cost: 0, attack: 10, defense: 50, element: 'neutral' },
      { id: 1, name: 'Plain', terrain: 'neutral', squareType: 'land', tollBase: 50 }
    )
    expect(outcome.attackerWins).toBe(true)
  })

  it('applies terrain and element bonuses', () => {
    const atk = computeAttackPower(
      { id: 'a', name: 'Salamander', cost: 0, attack: 50, defense: 0, element: 'fire' },
      { id: 1, name: 'Ember', terrain: 'fire', squareType: 'land', tollBase: 50 }
    )
    const def = computeDefensePower(
      { id: 'b', name: 'Golem', cost: 0, attack: 0, defense: 50, element: 'earth' },
      { id: 1, name: 'Ember', terrain: 'fire', squareType: 'land', tollBase: 50 }
    )
    expect(atk).toBe(80)
    expect(def).toBe(50)
    expect(elementAdvantageBonus('fire', 'earth')).toBe(25)
  })
})

describe('win condition', () => {
  it('ends the game when a player reaches target gold', () => {
    let state = createInitialState(['Alice', 'Bob'])
    state = {
      ...state,
      players: [{ ...state.players[0], gold: 2500 }, state.players[1]],
      phase: 'landed',
      selectedSquareId: 0
    }
    state = reduceGame(state, { type: 'choose_action', action: 'skip' })
    expect(state.phase).toBe('game_over')
    expect(state.winnerId).toBe(0)
  })
})
