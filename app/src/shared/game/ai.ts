import { tollAmount } from './economy'
import {
  canRoll,
  getAvailableActions,
  getSelectableCardIds,
  reduceGame
} from './state'
import type { GameAction, GameState } from './types'

/**
 * Simple legal-move AI: prefers place matching element, fights when richer,
 * pays toll when affordable, levels up when flush, otherwise skips.
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
    if (state.phase === 'select_spell') {
      return { type: 'select_spell', cardId: ids[0] }
    }
    // Prefer cheapest creature
    const player = state.players[state.currentPlayerIndex]
    const sorted = [...ids].sort((a, b) => {
      const ca = player.hand.find((c) => c.instanceId === a)?.cost ?? 0
      const cb = player.hand.find((c) => c.instanceId === b)?.cost ?? 0
      return ca - cb
    })
    return { type: 'select_creature', cardId: sorted[0] }
  }

  if (state.phase === 'landed' || state.phase === 'territory_menu') {
    const actions = getAvailableActions(state)
    const player = state.players[state.currentPlayerIndex]
    const squareId = state.selectedSquareId ?? player.position

    if (actions.includes('place')) return { type: 'choose_action', action: 'place' }
    if (actions.includes('level_up') && player.magic > 400) {
      return { type: 'choose_action', action: 'level_up' }
    }
    if (actions.includes('battle')) return { type: 'choose_action', action: 'battle' }
    if (actions.includes('pay_toll') && player.magic >= tollAmount(state, squareId)) {
      return { type: 'choose_action', action: 'pay_toll' }
    }
    if (actions.includes('shrine')) return { type: 'choose_action', action: 'shrine' }
    if (actions.includes('cast_spell') && player.magic > 300) {
      return { type: 'choose_action', action: 'cast_spell' }
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
