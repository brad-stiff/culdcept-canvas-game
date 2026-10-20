import {
  advancePosition,
  crossedStart,
  levelUpCost,
  squareById,
  territoryAt
} from './board'
import { resolveBattleFromState } from './combat'
import { tollAmount, totalMagic } from './economy'
import { COLOSSEUM_CONFIG } from './maps/colosseum'
import {
  buildStarterBook,
  cloneHand,
  cloneMatchCard,
  resetInstanceIds,
  shuffleInPlace
} from './matchCards'
import { drawOne, isCastableSpell, tryResolveSpell } from './spells'
import type {
  GameAction,
  GameState,
  LandedAction,
  MatchCard,
  MatchSeat,
  Player,
  Territory
} from './types'

export const MVP_CONFIG = COLOSSEUM_CONFIG

function otherPlayerIndex(index: 0 | 1): 0 | 1 {
  return index === 0 ? 1 : 0
}

function clonePlayer(player: Player): Player {
  return {
    ...player,
    hand: cloneHand(player.hand),
    book: player.book.map(cloneMatchCard),
    discard: player.discard.map(cloneMatchCard)
  }
}

function cloneTerritories(territories: Territory[]): Territory[] {
  return territories.map((t) => ({ ...t, creature: cloneMatchCard(t.creature) }))
}

function appendLog(state: GameState, message: string): string[] {
  return [...state.log.slice(-24), message]
}

function withWinner(state: GameState): GameState {
  for (const player of state.players) {
    if (totalMagic(state, player) >= state.config.targetMagic) {
      return {
        ...state,
        phase: 'game_over',
        winnerId: player.id,
        log: appendLog(state, `${player.name} reaches ${state.config.targetMagic}G and wins!`)
      }
    }
  }
  return state
}

function makePlayer(seat: MatchSeat, id: 0 | 1, color: string, startMagic: number): Player {
  const book = shuffleInPlace(buildStarterBook(id === 0 ? 1 : 17))
  let player: Player = {
    id,
    name: seat.name,
    color,
    magic: startMagic,
    position: 0,
    hand: [],
    book,
    discard: [],
    isAi: seat.isAi
  }
  for (let i = 0; i < 4; i++) {
    const drawn = drawOne(player, MVP_CONFIG.handLimit)
    player = drawn.player
  }
  return player
}

export function createInitialState(seats: [MatchSeat, MatchSeat] | [string, string]): GameState {
  resetInstanceIds()
  const normalized: [MatchSeat, MatchSeat] =
    typeof seats[0] === 'string'
      ? [
          { name: seats[0], isAi: false },
          { name: seats[1] as string, isAi: false }
        ]
      : (seats as [MatchSeat, MatchSeat])

  const players: [Player, Player] = [
    makePlayer(normalized[0], 0, '#5b9fd4', COLOSSEUM_CONFIG.startMagic),
    makePlayer(normalized[1], 1, '#d45b7a', COLOSSEUM_CONFIG.startMagic)
  ]

  return {
    config: COLOSSEUM_CONFIG,
    players,
    currentPlayerIndex: 0,
    territories: [],
    phase: 'upkeep',
    lastRoll: null,
    log: [
      `Free Battle — ${COLOSSEUM_CONFIG.mapName}. First to ${COLOSSEUM_CONFIG.targetMagic}G (magic + symbols) wins.`
    ],
    pendingAction: null,
    selectedSquareId: null,
    lastBattle: null,
    winnerId: null,
    pendingAttackerId: null
  }
}

function beginUpkeep(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const drawn = drawOne(player, state.config.handLimit)
  player = drawn.player
  const players = [...state.players] as [Player, Player]
  players[idx] = player
  const log = drawn.drew
    ? appendLog(state, `${player.name} draws ${drawn.drew.name}.`)
    : appendLog(state, `${player.name}'s turn.`)
  return {
    ...state,
    players,
    phase: 'roll',
    lastRoll: null,
    pendingAction: null,
    selectedSquareId: null,
    pendingAttackerId: null,
    log
  }
}

function endTurn(state: GameState): GameState {
  const next = otherPlayerIndex(state.currentPlayerIndex)
  return beginUpkeep({
    ...state,
    currentPlayerIndex: next,
    phase: 'upkeep',
    pendingAction: null,
    selectedSquareId: null,
    pendingAttackerId: null,
    lastBattle: null
  })
}

function afterLanding(state: GameState, player: Player): GameState {
  const square = squareById(state.config.board, player.position)
  const players = [...state.players] as [Player, Player]
  players[player.id as 0 | 1] = player
  let next: GameState = {
    ...state,
    players,
    phase: 'landed',
    selectedSquareId: player.position,
    pendingAction: null,
    pendingAttackerId: null
  }

  if (square.squareType === 'fort') {
    player = { ...player, magic: player.magic + state.config.fortMagic }
    players[player.id as 0 | 1] = player
    next = {
      ...next,
      players,
      log: appendLog(next, `${player.name} stops at ${square.name} (+${state.config.fortMagic}G).`)
    }
  }

  if (square.squareType === 'castle') {
    next = {
      ...next,
      log: appendLog(next, `${player.name} arrives at the Castle.`)
    }
  }

  return withWinner(next)
}

function applyRoll(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const roll = 1 + Math.floor(Math.random() * state.config.maxDie)
  const oldPos = player.position
  const newPos = advancePosition(oldPos, roll, state.config.board.length)
  player.position = newPos
  let log = appendLog(state, `${player.name} rolls ${roll}.`)
  if (crossedStart(oldPos, newPos)) {
    player.magic += state.config.lapMagic
    log = [...log.slice(0, -1), `${player.name} rolls ${roll} and laps (+${state.config.lapMagic}G).`]
  }
  const players = [...state.players] as [Player, Player]
  players[idx] = player
  return afterLanding({ ...state, players, lastRoll: roll, log }, player)
}

function removeFromHand(player: Player, instanceId: string): { player: Player; card: MatchCard } {
  const card = player.hand.find((c) => c.instanceId === instanceId)
  if (!card) throw new Error('Card not in hand')
  return {
    card,
    player: { ...player, hand: player.hand.filter((c) => c.instanceId !== instanceId) }
  }
}

function placeCreature(state: GameState, cardId: string): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const squareId = state.selectedSquareId ?? player.position
  const square = squareById(state.config.board, squareId)
  if (square.squareType !== 'land' || territoryAt(state, squareId)) {
    return state
  }
  const { player: without, card } = removeFromHand(player, cardId)
  if (card.kind !== 'creature' || without.magic < card.cost) return state
  player = { ...without, magic: without.magic - card.cost }
  const territories = [
    ...cloneTerritories(state.territories),
    { squareId, ownerId: player.id, creature: cloneMatchCard(card), level: 1 }
  ]
  const players = [...state.players] as [Player, Player]
  players[idx] = player
  return withWinner(
    endTurn({
      ...state,
      players,
      territories,
      log: appendLog(state, `${player.name} summons ${card.name} on ${square.name}.`)
    })
  )
}

function startBattle(state: GameState, cardId: string): GameState {
  const idx = state.currentPlayerIndex
  const player = state.players[idx]
  const card = player.hand.find((c) => c.instanceId === cardId)
  if (!card || card.kind !== 'creature') return state
  return {
    ...state,
    phase: 'select_item',
    pendingAction: 'battle',
    pendingAttackerId: cardId,
    log: appendLog(state, `${player.name} prepares to invade with ${card.name}.`)
  }
}

function finishBattle(state: GameState, itemId: string | null): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const attackerId = state.pendingAttackerId
  if (!attackerId) return state
  const squareId = state.selectedSquareId ?? player.position
  const terr = territoryAt(state, squareId)
  if (!terr || terr.ownerId === player.id) return state

  const removed = removeFromHand(player, attackerId)
  player = removed.player
  const attacker = removed.card
  let item: MatchCard | null = null
  if (itemId) {
    const itemRemoved = removeFromHand(player, itemId)
    player = itemRemoved.player
    item = itemRemoved.card
    player = { ...player, discard: [...player.discard, cloneMatchCard(item)] }
  }

  const outcome = resolveBattleFromState(state, attacker, item, squareId)
  let territories = cloneTerritories(state.territories)
  if (outcome.attackerWins) {
    territories = territories.filter((t) => t.squareId !== squareId)
    territories.push({
      squareId,
      ownerId: player.id,
      creature: { ...cloneMatchCard(attacker), hp: Math.max(1, outcome.attackerRemainingHp) },
      level: terr.level
    })
  } else {
    // Failed invasion — attacker discarded, defender may take damage
    player = { ...player, discard: [...player.discard, cloneMatchCard(attacker)] }
    territories = territories.map((t) =>
      t.squareId === squareId
        ? {
            ...t,
            creature: {
              ...t.creature,
              hp: Math.max(1, outcome.defenderRemainingHp)
            }
          }
        : t
    )
    const toll = tollAmount(state, squareId)
    if (player.magic >= toll) {
      player = { ...player, magic: player.magic - toll }
      const owner = clonePlayer(state.players[terr.ownerId as 0 | 1])
      owner.magic += toll
      const players = [...state.players] as [Player, Player]
      players[idx] = player
      players[terr.ownerId as 0 | 1] = owner
      return withWinner({
        ...state,
        players,
        territories,
        phase: 'battle_result',
        lastBattle: {
          ...outcome,
          message: `${outcome.message} ${player.name} pays ${toll}G toll.`
        },
        pendingAttackerId: null,
        log: appendLog(state, outcome.message)
      })
    }
  }

  const players = [...state.players] as [Player, Player]
  players[idx] = player
  return {
    ...state,
    players,
    territories,
    phase: 'battle_result',
    lastBattle: outcome,
    pendingAttackerId: null,
    log: appendLog(state, outcome.message)
  }
}

function payToll(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const squareId = state.selectedSquareId ?? player.position
  const terr = territoryAt(state, squareId)
  if (!terr || terr.ownerId === player.id) return endTurn(state)
  const toll = tollAmount(state, squareId)
  if (player.magic < toll) return state
  player = { ...player, magic: player.magic - toll }
  const owner = clonePlayer(state.players[terr.ownerId as 0 | 1])
  owner.magic += toll
  const players = [...state.players] as [Player, Player]
  players[idx] = player
  players[terr.ownerId as 0 | 1] = owner
  return withWinner(
    endTurn({
      ...state,
      players,
      log: appendLog(state, `${player.name} pays ${toll}G toll to ${owner.name}.`)
    })
  )
}

function levelUp(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const squareId = state.selectedSquareId ?? player.position
  const terr = territoryAt(state, squareId)
  if (!terr || terr.ownerId !== player.id) return state
  if (terr.level >= state.config.maxLandLevel) return state
  const cost = levelUpCost(terr.level)
  if (player.magic < cost) return state
  player = { ...player, magic: player.magic - cost }
  const territories = cloneTerritories(state.territories).map((t) =>
    t.squareId === squareId ? { ...t, level: t.level + 1 } : t
  )
  const players = [...state.players] as [Player, Player]
  players[idx] = player
  return withWinner(
    endTurn({
      ...state,
      players,
      territories,
      log: appendLog(state, `${player.name} levels land to ${terr.level + 1} (−${cost}G).`)
    })
  )
}

function shrinePray(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  if (Math.random() < 0.5) {
    player = { ...player, magic: player.magic + 50 }
    const players = [...state.players] as [Player, Player]
    players[idx] = player
    return withWinner(
      endTurn({
        ...state,
        players,
        log: appendLog(state, `${player.name} prays at the Shrine (+50G).`)
      })
    )
  }
  const drawn = drawOne(player, state.config.handLimit)
  player = drawn.player
  const players = [...state.players] as [Player, Player]
  players[idx] = player
  return endTurn({
    ...state,
    players,
    log: appendLog(
      state,
      drawn.drew
        ? `${player.name} prays at the Shrine and draws ${drawn.drew.name}.`
        : `${player.name} prays at the Shrine.`
    )
  })
}

function castSpell(state: GameState, cardId: string): GameState {
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const spell = player.hand.find((c) => c.instanceId === cardId)
  if (!spell || !isCastableSpell(spell, player.magic)) return state
  const result = tryResolveSpell(state, player, spell)
  if (!result.handled) return state
  return withWinner(
    endTurn({
      ...result.state,
      log: appendLog(state, result.message)
    })
  )
}

export function getAvailableActions(state: GameState): LandedAction[] {
  if (state.phase !== 'landed' && state.phase !== 'territory_menu') return []
  const player = state.players[state.currentPlayerIndex]
  const squareId = state.selectedSquareId ?? player.position
  const square = squareById(state.config.board, squareId)
  const terr = territoryAt(state, squareId)
  const actions: LandedAction[] = []

  if (square.squareType === 'shrine') {
    actions.push('shrine')
    actions.push('skip')
    return actions
  }

  if (square.squareType === 'land' && !terr) {
    if (player.hand.some((c) => c.kind === 'creature' && c.cost <= player.magic)) {
      actions.push('place')
    }
    actions.push('skip')
  } else if (square.squareType === 'land' && terr && terr.ownerId !== player.id) {
    if (player.hand.some((c) => c.kind === 'creature')) actions.push('battle')
    if (player.magic >= tollAmount(state, squareId)) actions.push('pay_toll')
    actions.push('skip')
  } else if (square.squareType === 'land' && terr && terr.ownerId === player.id) {
    if (terr.level < state.config.maxLandLevel && player.magic >= levelUpCost(terr.level)) {
      actions.push('level_up')
    }
    actions.push('skip')
  } else {
    actions.push('skip')
  }

  if (player.hand.some((c) => isCastableSpell(c, player.magic))) {
    actions.push('cast_spell')
  }

  return actions
}

export function getSelectableCardIds(state: GameState): string[] {
  const player = state.players[state.currentPlayerIndex]
  if (state.phase === 'select_creature' && state.pendingAction === 'place') {
    return player.hand.filter((c) => c.kind === 'creature' && c.cost <= player.magic).map((c) => c.instanceId)
  }
  if (state.phase === 'select_creature' && state.pendingAction === 'battle') {
    return player.hand.filter((c) => c.kind === 'creature').map((c) => c.instanceId)
  }
  if (state.phase === 'select_item') {
    return player.hand.filter((c) => c.kind === 'item').map((c) => c.instanceId)
  }
  if (state.phase === 'select_spell') {
    return player.hand.filter((c) => isCastableSpell(c, player.magic)).map((c) => c.instanceId)
  }
  return []
}

export function canRoll(state: GameState): boolean {
  return state.phase === 'roll'
}

export function getPhaseLabel(state: GameState): string {
  const name = state.players[state.currentPlayerIndex].name
  switch (state.phase) {
    case 'upkeep':
      return `${name} — upkeep`
    case 'roll':
      return `${name} — roll`
    case 'landed':
      return `${name} — choose action`
    case 'select_creature':
      return state.pendingAction === 'battle' ? `${name} — choose invader` : `${name} — choose creature`
    case 'select_item':
      return `${name} — equip item (or skip)`
    case 'select_spell':
      return `${name} — choose spell`
    case 'territory_menu':
      return `${name} — territory`
    case 'battle_result':
      return 'Battle result'
    case 'game_over':
      return 'Game over'
    default:
      return name
  }
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  if (state.phase === 'game_over') return state

  switch (action.type) {
    case 'begin_upkeep':
      return beginUpkeep(state)
    case 'roll_dice':
      if (state.phase !== 'roll') return state
      return applyRoll(state)
    case 'choose_action': {
      if (state.phase !== 'landed' && state.phase !== 'territory_menu') return state
      const available = getAvailableActions(state)
      if (!available.includes(action.action)) return state
      if (action.action === 'place') {
        return { ...state, phase: 'select_creature', pendingAction: 'place' }
      }
      if (action.action === 'battle') {
        return { ...state, phase: 'select_creature', pendingAction: 'battle' }
      }
      if (action.action === 'pay_toll') return payToll(state)
      if (action.action === 'level_up') return levelUp(state)
      if (action.action === 'shrine') return shrinePray(state)
      if (action.action === 'cast_spell') {
        return { ...state, phase: 'select_spell', pendingAction: 'cast_spell' }
      }
      if (action.action === 'skip') return endTurn(state)
      return state
    }
    case 'select_creature':
      if (state.phase !== 'select_creature') return state
      if (state.pendingAction === 'place') return placeCreature(state, action.cardId)
      if (state.pendingAction === 'battle') return startBattle(state, action.cardId)
      return state
    case 'select_item':
      if (state.phase !== 'select_item') return state
      return finishBattle(state, action.cardId)
    case 'select_spell':
      if (state.phase !== 'select_spell') return state
      return castSpell(state, action.cardId)
    case 'acknowledge_battle':
      if (state.phase !== 'battle_result') return state
      return withWinner(endTurn(state))
    case 'end_turn':
      return endTurn(state)
    default:
      return state
  }
}

/** Ensure a freshly created match starts on roll after first upkeep. */
export function startMatch(seats: [MatchSeat, MatchSeat] | [string, string]): GameState {
  return beginUpkeep(createInitialState(seats))
}
