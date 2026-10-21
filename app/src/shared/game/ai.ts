import { emptyAdjacentLands, squareById, territoryAt, undirectedNeighbors } from './board'
import { estimateInvasionFavorable } from './combat'
import { symbolLevelTotal, tollAmount } from './economy'
import { spellHasHandledEffect } from './spells'
import {
  canRoll,
  getAvailableActions,
  getMoveTargets,
  getPathChoices,
  getSelectableCardIds,
  reduceGame
} from './state'
import { territoryAbilityHasHandledEffect } from './territoryAbilities'
import type { GameAction, GameState, MatchCard } from './types'

function preferElementMatch(handIds: string[], player: GameState['players'][0], terrain: string): string {
  const cards = handIds
    .map((id) => player.hand.find((c) => c.instanceId === id))
    .filter((c): c is MatchCard => Boolean(c))
  const matching = cards.filter((c) => c.element === terrain)
  const pool = matching.length > 0 ? matching : cards
  pool.sort((a, b) => a.cost - b.cost)
  return pool[0]?.instanceId ?? handIds[0]
}

/**
 * Phase-3B AI: forks, element-aware move, handled territory abilities.
 */
export function chooseAiAction(state: GameState): GameAction | null {
  if (state.phase === 'game_over') return null

  if (state.phase === 'upkeep') {
    return { type: 'begin_upkeep' }
  }

  if (canRoll(state)) {
    return { type: 'roll_dice' }
  }

  if (state.phase === 'choose_path') {
    const choices = getPathChoices(state)
    if (choices.length === 0) return null
    const player = state.players[state.currentPlayerIndex]
    const preferred = choices.find((id) => {
      const sq = squareById(state.config.board, id)
      return player.hand.some((c) => c.kind === 'creature' && c.element === sq.terrain)
    })
    return { type: 'choose_path', squareId: preferred ?? choices[0] }
  }

  if (state.phase === 'select_square') {
    const targets = getMoveTargets(state)
    if (targets.length === 0) return { type: 'end_turn' }
    const player = state.players[state.currentPlayerIndex]
    const fromId = state.selectedSquareId ?? player.position
    const terr = territoryAt(state, fromId)
    if (state.pendingAction === 'exchange' && terr) {
      const better = targets.find((id) => {
        const other = territoryAt(state, id)
        if (!other) return false
        const here = squareById(state.config.board, fromId)
        const dest = squareById(state.config.board, id)
        const thisGains = terr.creature.element === dest.terrain && terr.creature.element !== here.terrain
        const otherGains =
          other.creature.element === here.terrain && other.creature.element !== dest.terrain
        return thisGains || otherGains
      })
      return { type: 'select_square', squareId: better ?? targets[0] }
    }
    const match = targets.find((id) => {
      const sq = squareById(state.config.board, id)
      return terr?.creature.element === sq.terrain
    })
    return { type: 'select_square', squareId: match ?? targets[0] }
  }

  if (state.phase === 'battle_result') {
    return { type: 'acknowledge_battle' }
  }

  if (state.phase === 'select_item') {
    const items = getSelectableCardIds(state)
    return { type: 'select_item', cardId: items[0] ?? null }
  }

  if (state.phase === 'select_creature' || state.phase === 'select_spell') {
    const ids = getSelectableCardIds(state)
    if (ids.length === 0) return { type: 'end_turn' }
    const player = state.players[state.currentPlayerIndex]
    if (state.phase === 'select_spell') {
      const scored = ids
        .map((id) => player.hand.find((c) => c.instanceId === id)!)
        .filter(Boolean)
        .sort((a, b) => {
          const ah = spellHasHandledEffect(a.abilityText) ? 0 : 1
          const bh = spellHasHandledEffect(b.abilityText) ? 0 : 1
          if (ah !== bh) return ah - bh
          return a.cost - b.cost
        })
      return { type: 'select_spell', cardId: scored[0]?.instanceId ?? ids[0] }
    }
    const squareId = state.selectedSquareId ?? player.position
    const terrain = squareById(state.config.board, squareId).terrain
    return { type: 'select_creature', cardId: preferElementMatch(ids, player, terrain) }
  }

  if (state.phase === 'landed' || state.phase === 'territory_menu') {
    const actions = getAvailableActions(state)
    const player = state.players[state.currentPlayerIndex]
    const squareId = state.selectedSquareId ?? player.position
    const square = squareById(state.config.board, squareId)
    const terr = territoryAt(state, squareId)
    const toll = tollAmount(state, squareId)

    if (actions.includes('place')) return { type: 'choose_action', action: 'place' }

    if (actions.includes('battle') && terr) {
      const invaders = player.hand.filter((c) => c.kind === 'creature' && !c.keywords.includes('defensive'))
      const favored = invaders.some((c) =>
        estimateInvasionFavorable(c, terr.creature, square, terr.level, null)
      )
      if (favored) return { type: 'choose_action', action: 'battle' }
      if (actions.includes('pay_toll') && player.magic >= toll) {
        return { type: 'choose_action', action: 'pay_toll' }
      }
    } else if (actions.includes('battle')) {
      return { type: 'choose_action', action: 'battle' }
    }

    if (actions.includes('pay_toll') && player.magic >= toll) {
      return { type: 'choose_action', action: 'pay_toll' }
    }

    if (actions.includes('move_creature') && terr) {
      const dests = emptyAdjacentLands(state, squareId)
      const better = dests.some((id) => {
        const sq = squareById(state.config.board, id)
        return terr.creature.element === sq.terrain && square.terrain !== sq.terrain
      })
      if (better) return { type: 'choose_action', action: 'move_creature' }
    }

    if (actions.includes('exchange') && terr) {
      const neighbors = undirectedNeighbors(state.config.board, squareId)
      const better = state.territories.some((t) => {
        if (t.ownerId !== player.id || t.squareId === squareId) return false
        if (!neighbors.includes(t.squareId)) return false
        const otherSq = squareById(state.config.board, t.squareId)
        const thisGains =
          terr.creature.element === otherSq.terrain && terr.creature.element !== square.terrain
        const otherGains =
          t.creature.element === square.terrain && t.creature.element !== otherSq.terrain
        return thisGains || otherGains
      })
      if (better) return { type: 'choose_action', action: 'exchange' }
    }

    if (actions.includes('transform')) {
      return { type: 'choose_action', action: 'transform' }
    }

    if (actions.includes('territory_ability') && terr && player.magic > 200) {
      if (territoryAbilityHasHandledEffect(terr.creature.abilityText) || player.magic > 400) {
        return { type: 'choose_action', action: 'territory_ability' }
      }
    }

    if (actions.includes('level_up')) {
      const flush = player.magic > 350
      const pressure = terr != null && terr.level < 3 && player.magic > 250
      if (flush || pressure) return { type: 'choose_action', action: 'level_up' }
    }

    if (actions.includes('temple') && symbolLevelTotal(state, player.id) > 0) {
      return { type: 'choose_action', action: 'temple' }
    }

    if (actions.includes('fortune') && player.magic < 200) {
      return { type: 'choose_action', action: 'fortune' }
    }

    if (actions.includes('shrine')) return { type: 'choose_action', action: 'shrine' }

    if (actions.includes('temple')) return { type: 'choose_action', action: 'temple' }

    if (actions.includes('fortune')) return { type: 'choose_action', action: 'fortune' }

    if (actions.includes('cast_spell') && player.magic > 200) {
      const hasReal = player.hand.some(
        (c) => c.kind === 'spell' && c.cost <= player.magic && spellHasHandledEffect(c.abilityText)
      )
      if (hasReal || player.magic > 400) {
        return { type: 'choose_action', action: 'cast_spell' }
      }
    }

    if (actions.includes('skip')) return { type: 'choose_action', action: 'skip' }
  }

  return null
}

/** Advance the state while the current player is AI (bounded steps). */
export function runAiUntilHuman(state: GameState, maxSteps = 80): GameState {
  let current = state
  for (let i = 0; i < maxSteps; i++) {
    if (current.phase === 'game_over') break
    const player = current.players[current.currentPlayerIndex]
    if (!player.isAi) break
    const action = chooseAiAction(current)
    if (!action) break
    current = reduceGame(current, action)
  }
  return current
}
