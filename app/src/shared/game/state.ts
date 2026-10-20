import {
  advancePosition,
  crossedStart,
  levelUpCost,
  squareById,
  territoryAt
} from './board'
import { resolveBattleFromState } from './combat'
import { tollAmount, totalMagic } from './economy'
import { getMapConfig } from './maps'
import {
  buildBookFromCatalogIds,
  buildStarterBook,
  canEquipItem,
  canInvadeWith,
  canPlaceOnTerrain,
  cloneHand,
  cloneMatchCard,
  resetInstanceIds,
  shuffleInPlace
} from './matchCards'
import { PLAYER_COLORS } from './playerColors'
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

export const MVP_CONFIG = getMapConfig('colosseum-i')

function nextPlayerIndex(state: GameState): number {
  return (state.currentPlayerIndex + 1) % state.players.length
}

function withPlayers(state: GameState, players: Player[]): GameState {
  return { ...state, players }
}

function replacePlayer(state: GameState, player: Player): GameState {
  const players = state.players.map((p) => (p.id === player.id ? player : p))
  return withPlayers(state, players)
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

function bookForSeat(seat: MatchSeat, id: number): MatchCard[] {
  if (seat.bookCatalogIds && seat.bookCatalogIds.length > 0) {
    return shuffleInPlace(buildBookFromCatalogIds(seat.bookCatalogIds))
  }
  return shuffleInPlace(buildStarterBook(id * 17 + 3))
}

function makePlayer(
  seat: MatchSeat,
  id: number,
  color: string,
  startMagic: number,
  handLimit: number
): Player {
  const book = bookForSeat(seat, id)
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
    const drawn = drawOne(player, handLimit)
    player = drawn.player
  }
  return player
}

function normalizeSeats(seats: MatchSeat[] | string[]): MatchSeat[] {
  if (typeof seats[0] === 'string') {
    return (seats as string[]).map((name) => ({ name, isAi: false }))
  }
  return seats as MatchSeat[]
}

export type StartMatchOptions = {
  mapId?: string
}

export function createInitialState(
  seats: MatchSeat[] | string[],
  options: StartMatchOptions = {}
): GameState {
  resetInstanceIds()
  const normalized = normalizeSeats(seats)
  if (normalized.length < 2 || normalized.length > 4) {
    throw new Error('Free Battle requires 2–4 players')
  }

  const config = getMapConfig(options.mapId ?? 'colosseum-i')
  const players = normalized.map((seat, id) =>
    makePlayer(seat, id, PLAYER_COLORS[id] ?? '#888', config.startMagic, config.handLimit)
  )

  return {
    config,
    players,
    currentPlayerIndex: 0,
    territories: [],
    phase: 'upkeep',
    lastRoll: null,
    log: [
      `Free Battle — ${config.mapName} (${players.length} cepters). First to ${config.targetMagic}G (magic + symbols) wins.`
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
  const log = drawn.drew
    ? appendLog(state, `${player.name} draws ${drawn.drew.name}.`)
    : appendLog(state, `${player.name}'s turn.`)
  return {
    ...replacePlayer(state, player),
    phase: 'roll',
    lastRoll: null,
    pendingAction: null,
    selectedSquareId: null,
    pendingAttackerId: null,
    log
  }
}

function endTurn(state: GameState): GameState {
  const next = nextPlayerIndex(state)
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
  let next: GameState = {
    ...replacePlayer(state, player),
    phase: 'landed',
    selectedSquareId: player.position,
    pendingAction: null,
    pendingAttackerId: null
  }

  if (square.squareType === 'fort') {
    player = { ...player, magic: player.magic + state.config.fortMagic }
    next = {
      ...replacePlayer(next, player),
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
  return afterLanding({ ...replacePlayer(state, player), lastRoll: roll, log }, player)
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
  if (!canPlaceOnTerrain(card, square.terrain)) return state
  player = { ...without, magic: without.magic - card.cost }
  const territories = [
    ...cloneTerritories(state.territories),
    { squareId, ownerId: player.id, creature: cloneMatchCard(card), level: 1 }
  ]
  return withWinner(
    endTurn({
      ...replacePlayer(state, player),
      territories,
      log: appendLog(state, `${player.name} summons ${card.name} on ${square.name}.`)
    })
  )
}

function startBattle(state: GameState, cardId: string): GameState {
  const idx = state.currentPlayerIndex
  const player = state.players[idx]
  const card = player.hand.find((c) => c.instanceId === cardId)
  if (!card || !canInvadeWith(card)) return state
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
    if (!canEquipItem(attacker, itemRemoved.card)) return state
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
      const owner = clonePlayer(state.players[terr.ownerId])
      owner.magic += toll
      let next = replacePlayer(state, player)
      next = replacePlayer(next, owner)
      return withWinner({
        ...next,
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

  return {
    ...replacePlayer(state, player),
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
  const owner = clonePlayer(state.players[terr.ownerId])
  owner.magic += toll
  let next = replacePlayer(state, player)
  next = replacePlayer(next, owner)
  return withWinner(
    endTurn({
      ...next,
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
  return withWinner(
    endTurn({
      ...replacePlayer(state, player),
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
    return withWinner(
      endTurn({
        ...replacePlayer(state, player),
        log: appendLog(state, `${player.name} prays at the Shrine (+50G).`)
      })
    )
  }
  const drawn = drawOne(player, state.config.handLimit)
  player = drawn.player
  return endTurn({
    ...replacePlayer(state, player),
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
    if (
      player.hand.some(
        (c) => c.kind === 'creature' && c.cost <= player.magic && canPlaceOnTerrain(c, square.terrain)
      )
    ) {
      actions.push('place')
    }
    actions.push('skip')
  } else if (square.squareType === 'land' && terr && terr.ownerId !== player.id) {
    if (player.hand.some((c) => canInvadeWith(c))) actions.push('battle')
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
  const squareId = state.selectedSquareId ?? player.position
  const square = squareById(state.config.board, squareId)
  if (state.phase === 'select_creature' && state.pendingAction === 'place') {
    return player.hand
      .filter(
        (c) => c.kind === 'creature' && c.cost <= player.magic && canPlaceOnTerrain(c, square.terrain)
      )
      .map((c) => c.instanceId)
  }
  if (state.phase === 'select_creature' && state.pendingAction === 'battle') {
    return player.hand.filter((c) => canInvadeWith(c)).map((c) => c.instanceId)
  }
  if (state.phase === 'select_item') {
    const attacker = player.hand.find((c) => c.instanceId === state.pendingAttackerId)
    if (!attacker) return []
    return player.hand
      .filter((c) => c.instanceId !== attacker.instanceId && canEquipItem(attacker, c))
      .map((c) => c.instanceId)
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
export function startMatch(seats: MatchSeat[] | string[], options: StartMatchOptions = {}): GameState {
  return beginUpkeep(createInitialState(seats, options))
}
