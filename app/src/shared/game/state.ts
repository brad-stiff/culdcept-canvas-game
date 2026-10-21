import {
  emptyAdjacentLands,
  levelUpCost,
  pathChoices,
  squareById,
  territoryAt,
  transformCost,
  walkPath
} from './board'
import { resolveBattleFromState } from './combat'
import { symbolLevelTotal, tollAmount, totalMagic } from './economy'
import {
  globalBlockTransform,
  globalDisableTerritoryAbility,
  globalExtraDraw,
  globalIgnoreLandLimits,
  globalUniqueInPlay,
  moveDisabledByGlobal
} from './globals'
import { getMapConfig } from './maps'
import {
  buildBookFromCatalogIds,
  buildStarterBook,
  canEquipItem,
  canInvadeWith,
  canMoveCreature,
  canPlaceOnTerrain,
  cloneHand,
  cloneMatchCard,
  hasTerritoryAbility,
  resetInstanceIds,
  shuffleInPlace,
  territoryAbilityCost
} from './matchCards'
import { PLAYER_COLORS } from './playerColors'
import { drawOne, isCastableSpell, tryResolveSpell } from './spells'
import { tryResolveTerritoryAbility } from './territoryAbilities'
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
  return territories.map((t) => ({ ...t, creature: cloneMatchCard(t.creature), tollHalved: t.tollHalved }))
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

  const source = getMapConfig(options.mapId ?? 'colosseum-i')
  const config = {
    ...source,
    board: source.board.map((s) => ({ ...s, exits: [...s.exits] })),
    layout: source.layout?.map((p) => ({ ...p }))
  }
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
    pendingAttackerId: null,
    pendingSteps: 0,
    pathFromId: null
  }
}

function beginUpkeep(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const draws = globalExtraDraw(state) ? 2 : 1
  const drewNames: string[] = []
  for (let i = 0; i < draws; i++) {
    const drawn = drawOne(player, state.config.handLimit)
    player = drawn.player
    if (drawn.drew) drewNames.push(drawn.drew.name)
  }
  const log = drewNames.length
    ? appendLog(state, `${player.name} draws ${drewNames.join(', ')}.`)
    : appendLog(state, `${player.name}'s turn.`)
  return {
    ...replacePlayer(state, player),
    phase: 'roll',
    lastRoll: null,
    pendingAction: null,
    selectedSquareId: null,
    pendingAttackerId: null,
    pendingSteps: 0,
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

function afterLanding(state: GameState, player: Player, skipWarp = false): GameState {
  const square = squareById(state.config.board, player.position)
  if (square.squareType === 'warp' && !skipWarp && square.warpTo != null) {
    const dest = squareById(state.config.board, square.warpTo)
    const warped = { ...player, position: dest.id }
    const logged = {
      ...replacePlayer(state, warped),
      log: appendLog(state, `${player.name} warps from ${square.name} to ${dest.name}.`)
    }
    return afterLanding(logged, warped, true)
  }

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

function canSummonCreatureType(state: GameState, card: MatchCard): boolean {
  if (globalUniqueInPlay(state) && state.territories.some((t) => t.creature.catalogId === card.catalogId)) {
    return false
  }
  return true
}

function canSummonOnLand(
  state: GameState,
  card: MatchCard,
  terrain: GameState['config']['board'][0]['terrain']
): boolean {
  if (card.kind !== 'creature') return false
  if (!canSummonCreatureType(state, card)) return false
  if (globalIgnoreLandLimits(state)) return true
  return canPlaceOnTerrain(card, terrain)
}

function applyWalkResult(
  state: GameState,
  player: Player,
  walk: ReturnType<typeof walkPath>,
  roll: number,
  logBase: string
): GameState {
  if (walk.kind === 'fork') {
    let nextPlayer = { ...player, position: walk.position }
    let log = appendLog(state, `${logBase} Choose a path.`)
    if (walk.crossedCastle) {
      nextPlayer = { ...nextPlayer, magic: nextPlayer.magic + state.config.lapMagic }
      log = appendLog(state, `${player.name} laps (+${state.config.lapMagic}G).`)
    }
    return {
      ...replacePlayer(state, nextPlayer),
      phase: 'choose_path',
      lastRoll: roll,
      pendingSteps: walk.remaining,
      pathFromId: walk.cameFrom,
      selectedSquareId: nextPlayer.position,
      log
    }
  }
  let nextPlayer = { ...player, position: walk.position }
  let log = appendLog(state, logBase)
  if (walk.crossedCastle) {
    nextPlayer = { ...nextPlayer, magic: nextPlayer.magic + state.config.lapMagic }
    log = appendLog(state, `${player.name} laps (+${state.config.lapMagic}G).`)
  }
  return afterLanding(
    {
      ...replacePlayer(state, nextPlayer),
      lastRoll: roll,
      pendingSteps: 0,
      pathFromId: walk.cameFrom,
      log
    },
    nextPlayer
  )
}

function applyRoll(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const roll = 1 + Math.floor(Math.random() * state.config.maxDie)
  const walk = walkPath(state.config.board, player.position, roll, state.pathFromId)
  return applyWalkResult(state, player, walk, roll, `${player.name} rolls ${roll}.`)
}

function choosePath(state: GameState, squareId: number): GameState {
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const here = squareById(state.config.board, player.position)
  const choices = pathChoices(here, state.pathFromId)
  if (!choices.includes(squareId)) return state
  const remainingAfter = state.pendingSteps - 1
  let nextPlayer = { ...player, position: squareId }
  let crossedCastle = squareById(state.config.board, squareId).squareType === 'castle'
  if (remainingAfter <= 0) {
    let log = appendLog(state, `${player.name} takes the ${squareById(state.config.board, squareId).name} path.`)
    if (crossedCastle) {
      nextPlayer = { ...nextPlayer, magic: nextPlayer.magic + state.config.lapMagic }
      log = appendLog(state, `${player.name} laps (+${state.config.lapMagic}G).`)
    }
    return afterLanding(
      {
        ...replacePlayer(state, nextPlayer),
        pendingSteps: 0,
        pathFromId: player.position,
        log
      },
      nextPlayer
    )
  }
  const walk = walkPath(state.config.board, squareId, remainingAfter, player.position)
  let afterStep = replacePlayer(state, nextPlayer)
  let logMsg = `${player.name} takes the ${squareById(state.config.board, squareId).name} path.`
  if (crossedCastle) {
    nextPlayer = { ...nextPlayer, magic: nextPlayer.magic + state.config.lapMagic }
    afterStep = replacePlayer(state, nextPlayer)
    logMsg = `${player.name} laps (+${state.config.lapMagic}G).`
  }
  return applyWalkResult(
    { ...afterStep, log: appendLog(state, logMsg) },
    nextPlayer,
    walk,
    state.lastRoll ?? 0,
    `${player.name} continues.`
  )
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
  if (!canSummonOnLand(state, card, square.terrain)) return state
  player = { ...without, magic: without.magic - card.cost }
  const territories = [
    ...cloneTerritories(state.territories),
    { squareId, ownerId: player.id, creature: cloneMatchCard(card), level: 1, tollHalved: false }
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
      level: terr.level,
      tollHalved: false
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

function templePray(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const payout = symbolLevelTotal(state, player.id) * 20
  player = { ...player, magic: player.magic + payout }
  return withWinner(
    endTurn({
      ...replacePlayer(state, player),
      log: appendLog(state, `${player.name} visits the Temple (+${payout}G).`)
    })
  )
}

function fortuneTeller(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const roll = Math.random()
  if (roll < 1 / 3) {
    player = { ...player, magic: player.magic + 80 }
    return withWinner(
      endTurn({
        ...replacePlayer(state, player),
        log: appendLog(state, `${player.name} consults the Fortune-Teller (+80G).`)
      })
    )
  }
  if (roll < 2 / 3) {
    const drawn = drawOne(player, state.config.handLimit)
    player = drawn.player
    return endTurn({
      ...replacePlayer(state, player),
      log: appendLog(
        state,
        drawn.drew
          ? `${player.name} consults the Fortune-Teller and draws ${drawn.drew.name}.`
          : `${player.name} consults the Fortune-Teller.`
      )
    })
  }
  const castle = state.config.board.find((s) => s.squareType === 'castle')
  player = { ...player, position: castle?.id ?? 0 }
  return endTurn({
    ...replacePlayer(state, player),
    log: appendLog(state, `${player.name} is sent to the Castle (no lap).`)
  })
}

function transformLand(state: GameState): GameState {
  if (globalBlockTransform(state)) return state
  const idx = state.currentPlayerIndex
  let player = clonePlayer(state.players[idx])
  const squareId = state.selectedSquareId ?? player.position
  const terr = territoryAt(state, squareId)
  if (!terr || terr.ownerId !== player.id) return state
  const el = terr.creature.element
  if (!el || el === 'neutral' || el === 'dual') return state
  const square = squareById(state.config.board, squareId)
  if (square.terrain === el) return state
  const cost = transformCost(terr.level)
  if (player.magic < cost) return state
  player = { ...player, magic: player.magic - cost }
  const board = state.config.board.map((s) =>
    s.id === squareId ? { ...s, terrain: el, exits: [...s.exits] } : { ...s, exits: [...s.exits] }
  )
  return withWinner(
    endTurn({
      ...replacePlayer(state, player),
      config: { ...state.config, board },
      log: appendLog(state, `${player.name} transforms ${square.name} to ${el} (−${cost}G).`)
    })
  )
}

function exchangeCreatures(state: GameState, destId: number): GameState {
  if (moveDisabledByGlobal(state)) return state
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const fromId = state.selectedSquareId ?? player.position
  const a = territoryAt(state, fromId)
  const b = territoryAt(state, destId)
  if (!a || !b || a.ownerId !== player.id || b.ownerId !== player.id) return state
  if (a.squareId === b.squareId) return state
  const territories = cloneTerritories(state.territories).map((t) => {
    if (t.squareId === fromId) return { ...t, creature: cloneMatchCard(b.creature) }
    if (t.squareId === destId) return { ...t, creature: cloneMatchCard(a.creature) }
    return t
  })
  return withWinner(
    endTurn({
      ...replacePlayer(state, player),
      territories,
      pendingAction: null,
      log: appendLog(
        state,
        `${player.name} exchanges ${a.creature.name} with ${b.creature.name}.`
      )
    })
  )
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

  if (square.squareType === 'temple') {
    actions.push('temple')
    actions.push('skip')
    return actions
  }

  if (square.squareType === 'fortune') {
    actions.push('fortune')
    actions.push('skip')
    return actions
  }

  if (square.squareType === 'land' && !terr) {
    if (
      player.hand.some(
        (c) => c.kind === 'creature' && c.cost <= player.magic && canSummonOnLand(state, c, square.terrain)
      )
    ) {
      actions.push('place')
    }
    actions.push('skip')
  } else if (square.squareType === 'land' && terr && terr.ownerId !== player.id) {
    if (player.hand.some((c) => canInvadeWith(c) && canSummonCreatureType(state, c))) {
      actions.push('battle')
    }
    if (player.magic >= tollAmount(state, squareId)) actions.push('pay_toll')
    actions.push('skip')
  } else if (square.squareType === 'land' && terr && terr.ownerId === player.id) {
    if (terr.level < state.config.maxLandLevel && player.magic >= levelUpCost(terr.level)) {
      actions.push('level_up')
    }
    if (
      canMoveCreature(terr.creature) &&
      emptyAdjacentLands(state, squareId).length > 0 &&
      !moveDisabledByGlobal(state)
    ) {
      actions.push('move_creature')
    }
    if (
      hasTerritoryAbility(terr.creature) &&
      player.magic >= territoryAbilityCost(terr.creature) &&
      !globalDisableTerritoryAbility(state)
    ) {
      actions.push('territory_ability')
    }
    if (
      !moveDisabledByGlobal(state) &&
      state.territories.some((t) => t.ownerId === player.id && t.squareId !== squareId)
    ) {
      actions.push('exchange')
    }
    const el = terr.creature.element
    if (
      !globalBlockTransform(state) &&
      el &&
      el !== 'neutral' &&
      el !== 'dual' &&
      el !== square.terrain &&
      player.magic >= transformCost(terr.level)
    ) {
      actions.push('transform')
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
        (c) => c.kind === 'creature' && c.cost <= player.magic && canSummonOnLand(state, c, square.terrain)
      )
      .map((c) => c.instanceId)
  }
  if (state.phase === 'select_creature' && state.pendingAction === 'battle') {
    return player.hand
      .filter((c) => canInvadeWith(c) && canSummonCreatureType(state, c))
      .map((c) => c.instanceId)
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
    case 'select_square':
      return `${name} — choose destination`
    case 'choose_path':
      return `${name} — choose path`
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

export function getPathChoices(state: GameState): number[] {
  if (state.phase !== 'choose_path') return []
  const player = state.players[state.currentPlayerIndex]
  const square = squareById(state.config.board, player.position)
  return pathChoices(square, state.pathFromId)
}

export function getMoveTargets(state: GameState): number[] {
  if (state.phase !== 'select_square') return []
  const player = state.players[state.currentPlayerIndex]
  const squareId = state.selectedSquareId ?? player.position
  if (state.pendingAction === 'move_creature') {
    return emptyAdjacentLands(state, squareId)
  }
  if (state.pendingAction === 'exchange') {
    return state.territories.filter((t) => t.ownerId === player.id && t.squareId !== squareId).map((t) => t.squareId)
  }
  return []
}

function moveCreatureTo(state: GameState, destId: number): GameState {
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const fromId = state.selectedSquareId ?? player.position
  const terr = territoryAt(state, fromId)
  if (!terr || terr.ownerId !== player.id) return state
  if (!canMoveCreature(terr.creature)) return state
  if (!emptyAdjacentLands(state, fromId).includes(destId)) return state
  const dest = squareById(state.config.board, destId)
  if (!canPlaceOnTerrain(terr.creature, dest.terrain)) return state
  const territories = cloneTerritories(state.territories)
    .filter((t) => t.squareId !== fromId)
    .concat([{ ...terr, squareId: destId }])
  return withWinner(
    endTurn({
      ...replacePlayer(state, player),
      territories,
      pendingAction: null,
      log: appendLog(state, `${player.name} moves ${terr.creature.name} to ${dest.name}.`)
    })
  )
}

function useTerritoryAbility(state: GameState): GameState {
  const idx = state.currentPlayerIndex
  const player = clonePlayer(state.players[idx])
  const squareId = state.selectedSquareId ?? player.position
  const terr = territoryAt(state, squareId)
  if (!terr || terr.ownerId !== player.id || !hasTerritoryAbility(terr.creature)) return state
  if (globalDisableTerritoryAbility(state)) return state
  const result = tryResolveTerritoryAbility(state, player, terr.creature, squareId)
  if (!result.handled) return state
  return withWinner(
    endTurn({
      ...result.state,
      pendingAction: null,
      log: appendLog(state, result.message)
    })
  )
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  if (state.phase === 'game_over') return state

  switch (action.type) {
    case 'begin_upkeep':
      return beginUpkeep(state)
    case 'roll_dice':
      if (state.phase !== 'roll') return state
      return applyRoll(state)
    case 'choose_path':
      if (state.phase !== 'choose_path') return state
      return choosePath(state, action.squareId)
    case 'select_square':
      if (state.phase !== 'select_square') return state
      if (state.pendingAction === 'move_creature') return moveCreatureTo(state, action.squareId)
      if (state.pendingAction === 'exchange') return exchangeCreatures(state, action.squareId)
      return state
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
      if (action.action === 'temple') return templePray(state)
      if (action.action === 'fortune') return fortuneTeller(state)
      if (action.action === 'cast_spell') {
        return { ...state, phase: 'select_spell', pendingAction: 'cast_spell' }
      }
      if (action.action === 'move_creature') {
        return { ...state, phase: 'select_square', pendingAction: 'move_creature' }
      }
      if (action.action === 'exchange') {
        return { ...state, phase: 'select_square', pendingAction: 'exchange' }
      }
      if (action.action === 'transform') return transformLand(state)
      if (action.action === 'territory_ability') return useTerritoryAbility(state)
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
