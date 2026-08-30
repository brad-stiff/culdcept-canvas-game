import { crossedStart, MVP_BOARD, squareById } from './board'
import { cloneCard, cloneHand, STARTER_DECK_P1, STARTER_DECK_P2 } from './cards'
import { resolveBattle, tollAmount } from './combat'
import type { GameAction, GameConfig, GameState, LandedAction, Player, Territory } from './types'

export const MVP_CONFIG: GameConfig = {
  targetGold: 2500,
  startGold: 800,
  passCastleGold: 200,
  board: MVP_BOARD
}

function otherPlayerIndex(index: 0 | 1): 0 | 1 {
  return index === 0 ? 1 : 0
}

function clonePlayer(player: Player): Player {
  return { ...player, hand: cloneHand(player.hand) }
}

function cloneTerritories(territories: Territory[]): Territory[] {
  return territories.map((t) => ({ ...t, creature: cloneCard(t.creature) }))
}

export function createInitialState(playerNames: [string, string]): GameState {
  const players: [Player, Player] = [
    {
      id: 0,
      name: playerNames[0],
      color: '#5b9fd4',
      gold: MVP_CONFIG.startGold,
      position: 0,
      hand: cloneHand(STARTER_DECK_P1)
    },
    {
      id: 1,
      name: playerNames[1],
      color: '#d45b7a',
      gold: MVP_CONFIG.startGold,
      position: 0,
      hand: cloneHand(STARTER_DECK_P2)
    }
  ]

  return {
    config: MVP_CONFIG,
    players,
    currentPlayerIndex: 0,
    territories: [],
    phase: 'roll',
    lastRoll: null,
    log: [
      `${players[0].name} vs ${players[1].name} — first to ${MVP_CONFIG.targetGold} gold wins.`
    ],
    pendingAction: null,
    selectedSquareId: null,
    lastBattle: null,
    winnerId: null
  }
}

function territoryAt(state: GameState, squareId: number): Territory | undefined {
  return state.territories.find((t) => t.squareId === squareId)
}

function appendLog(state: GameState, message: string): string[] {
  return [...state.log.slice(-19), message]
}

function checkWinner(state: GameState): number | null {
  for (const player of state.players) {
    if (player.gold >= state.config.targetGold) {
      return player.id
    }
  }
  return null
}

function withWinner(state: GameState): GameState {
  const winnerId = checkWinner(state)
  if (winnerId === null) {
    return state
  }
  const winner = state.players[winnerId]
  return {
    ...state,
    phase: 'game_over',
    winnerId,
    log: appendLog(state, `${winner.name} wins with ${winner.gold} gold!`)
  }
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]
}

function landedSquareId(state: GameState): number {
  return currentPlayer(state).position
}

function availableActions(state: GameState): LandedAction[] {
  const squareId = landedSquareId(state)
  const square = squareById(state.config.board, squareId)
  const territory = territoryAt(state, squareId)
  const player = currentPlayer(state)

  if (square.squareType === 'castle') {
    return ['skip']
  }

  if (!territory) {
    const canPlace = player.hand.some((c) => c.cost <= player.gold)
    return canPlace ? ['place', 'skip'] : ['skip']
  }

  if (territory.ownerId === player.id) {
    return ['skip']
  }

  const canBattle = player.hand.length > 0
  const toll = tollAmount(square)
  const canPay = player.gold >= toll
  const actions: LandedAction[] = []
  if (canBattle) actions.push('battle')
  if (canPay) actions.push('pay_toll')
  if (actions.length === 0) {
    actions.push('skip')
  }
  return actions
}

function nextTurn(state: GameState): GameState {
  const nextIndex = otherPlayerIndex(state.currentPlayerIndex)
  const next: GameState = {
    ...state,
    currentPlayerIndex: nextIndex,
    phase: 'roll',
    lastRoll: null,
    pendingAction: null,
    selectedSquareId: null,
    lastBattle: null,
    players: [clonePlayer(state.players[0]), clonePlayer(state.players[1])]
  }
  return withWinner(next)
}

function removeCardFromHand(player: Player, cardId: string): Player {
  const index = player.hand.findIndex((c) => c.id === cardId)
  if (index < 0) {
    throw new Error('Card not in hand')
  }
  const hand = [...player.hand]
  hand.splice(index, 1)
  return { ...player, hand }
}

function affordableCreatures(player: Player): string[] {
  return player.hand.filter((c) => c.cost <= player.gold).map((c) => c.id)
}

function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  if (state.phase === 'game_over') {
    return state
  }

  switch (action.type) {
    case 'roll_dice': {
      if (state.phase !== 'roll') {
        return state
      }
      const roll = rollDice()
      const playerIndex = state.currentPlayerIndex
      const players = [clonePlayer(state.players[0]), clonePlayer(state.players[1])] as [
        Player,
        Player
      ]
      const player = players[playerIndex]
      const oldPos = player.position
      const newPos = (oldPos + roll) % state.config.board.length
      player.position = newPos

      let log = appendLog(
        state,
        `${player.name} rolled ${roll} and moved to ${squareById(state.config.board, newPos).name}.`
      )

      if (crossedStart(oldPos, newPos)) {
        player.gold += state.config.passCastleGold
        log = appendLog(
          { ...state, log },
          `${player.name} passed the Castle (+${state.config.passCastleGold} gold).`
        )
      }

      players[playerIndex] = player

      const next: GameState = {
        ...state,
        players,
        lastRoll: roll,
        phase: 'landed',
        log,
        pendingAction: null,
        selectedSquareId: newPos
      }

      const actions = availableActions(next)
      if (actions.length === 1 && actions[0] === 'skip') {
        return nextTurn({ ...next, log: appendLog(next, `${player.name} has nothing to do here.`) })
      }

      return withWinner(next)
    }

    case 'choose_action': {
      if (state.phase !== 'landed') {
        return state
      }
      const allowed = availableActions(state)
      if (!allowed.includes(action.action)) {
        return state
      }

      const squareId = landedSquareId(state)
      const player = currentPlayer(state)

      if (action.action === 'skip') {
        return nextTurn({
          ...state,
          log: appendLog(state, `${player.name} moves on.`)
        })
      }

      if (action.action === 'place' || action.action === 'battle') {
        return {
          ...state,
          phase: 'select_creature',
          pendingAction: action.action,
          selectedSquareId: squareId
        }
      }

      if (action.action === 'pay_toll') {
        const square = squareById(state.config.board, squareId)
        const territory = territoryAt(state, squareId)
        if (!territory) {
          return state
        }
        const toll = tollAmount(square)
        const players = [clonePlayer(state.players[0]), clonePlayer(state.players[1])] as [
          Player,
          Player
        ]
        const payer = players[state.currentPlayerIndex]
        const owner = players[territory.ownerId]
        if (payer.gold < toll) {
          return state
        }
        payer.gold -= toll
        owner.gold += toll
        const next = nextTurn({
          ...state,
          players,
          log: appendLog(state, `${payer.name} paid ${toll} gold toll to ${owner.name}.`)
        })
        return next
      }

      return state
    }

    case 'select_creature': {
      if (state.phase !== 'select_creature' || !state.pendingAction) {
        return state
      }

      const squareId = state.selectedSquareId ?? landedSquareId(state)
      const square = squareById(state.config.board, squareId)
      const playerIndex = state.currentPlayerIndex
      const players = [clonePlayer(state.players[0]), clonePlayer(state.players[1])] as [
        Player,
        Player
      ]
      const player = players[playerIndex]
      const card = player.hand.find((c) => c.id === action.cardId)
      if (!card) {
        return state
      }

      if (state.pendingAction === 'place') {
        if (territoryAt(state, squareId)) {
          return state
        }
        if (card.cost > player.gold) {
          return state
        }
        players[playerIndex] = removeCardFromHand(
          { ...player, gold: player.gold - card.cost },
          card.id
        )
        const territory: Territory = {
          squareId,
          ownerId: player.id,
          creature: cloneCard(card)
        }
        const next = nextTurn({
          ...state,
          players,
          territories: [...cloneTerritories(state.territories), territory],
          log: appendLog(
            state,
            `${player.name} placed ${card.name} on ${square.name} for ${card.cost} gold.`
          )
        })
        return next
      }

      if (state.pendingAction === 'battle') {
        const territory = territoryAt(state, squareId)
        if (!territory || territory.ownerId === player.id) {
          return state
        }
        const outcome = resolveBattle(card, territory.creature, square)
        const ownerIndex = territory.ownerId as 0 | 1
        let territories = cloneTerritories(state.territories)
        let log = appendLog(state, outcome.message)

        if (outcome.attackerWins) {
          players[playerIndex] = removeCardFromHand(player, card.id)
          territories = territories.map((t) =>
            t.squareId === squareId
              ? { squareId, ownerId: player.id, creature: cloneCard(card) }
              : t
          )
          log = appendLog({ ...state, log }, `${player.name} claims ${square.name}!`)
        } else {
          const toll = tollAmount(square)
          if (player.gold >= toll) {
            players[playerIndex] = { ...player, gold: player.gold - toll }
            players[ownerIndex] = { ...players[ownerIndex], gold: players[ownerIndex].gold + toll }
            log = appendLog({ ...state, log }, `${player.name} pays ${toll} gold after defeat.`)
          }
        }

        const next: GameState = {
          ...state,
          players,
          territories,
          phase: 'battle_result',
          lastBattle: outcome,
          pendingAction: null,
          log
        }
        return withWinner(next)
      }

      return state
    }

    case 'acknowledge_battle': {
      if (state.phase !== 'battle_result') {
        return state
      }
      return nextTurn(state)
    }

    case 'end_turn': {
      if (state.phase === 'landed') {
        return nextTurn(state)
      }
      return state
    }

    default:
      return state
  }
}

export function getAvailableActions(state: GameState): LandedAction[] {
  if (state.phase !== 'landed') {
    return []
  }
  return availableActions(state)
}

export function getSelectableCardIds(state: GameState): string[] {
  if (state.phase !== 'select_creature' || !state.pendingAction) {
    return []
  }
  const player = currentPlayer(state)
  if (state.pendingAction === 'place') {
    return affordableCreatures(player)
  }
  return player.hand.map((c) => c.id)
}

export function getPhaseLabel(state: GameState): string {
  const player = currentPlayer(state)
  switch (state.phase) {
    case 'roll':
      return `${player.name}: roll the dice`
    case 'landed':
      return `${player.name}: choose an action`
    case 'select_creature':
      return state.pendingAction === 'battle'
        ? `${player.name}: choose a creature to attack`
        : `${player.name}: choose a creature to place`
    case 'battle_result':
      return 'Battle resolved'
    case 'game_over':
      return state.winnerId !== null ? `${state.players[state.winnerId].name} wins!` : 'Game over'
    default:
      return ''
  }
}

export function canRoll(state: GameState): boolean {
  return state.phase === 'roll'
}

export function canChooseAction(state: GameState, action: LandedAction): boolean {
  return state.phase === 'landed' && availableActions(state).includes(action)
}
