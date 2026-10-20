import { estimateInvasionFavorable } from './combat'
import { tollAmount } from './economy'
import { squareById, territoryAt } from './board'
import { spellHasHandledEffect } from './spells'
import {
  canRoll,
  getAvailableActions,
  getSelectableCardIds,
  reduceGame
} from './state'
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
 * Phase-3A AI: element-aware placement, fight when favored, prefer real spells.
 */
export function chooseAiAction(state: GameState): GameAction | null {
  if (state.phase === 'game_over') return null

  if (state.phase === 'upkeep') {
    return { type: 'begin_upkeep' }
  }

  if (canRoll(state)) {
    return { type: 'roll_dice' }
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

    if (actions.includes('level_up')) {
      const flush = player.magic > 350
      const pressure = terr != null && terr.level < 3 && player.magic > 250
      if (flush || pressure) return { type: 'choose_action', action: 'level_up' }
    }

    if (actions.includes('shrine')) return { type: 'choose_action', action: 'shrine' }

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
export function runAiUntilHuman(state: GameState, maxSteps = 40): GameState {
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
