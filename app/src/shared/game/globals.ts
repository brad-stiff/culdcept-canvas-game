import type { GameState, MatchCard } from './types'

function globalTexts(state: GameState): string[] {
  return state.territories
    .filter((t) => t.creature.keywords.includes('global'))
    .map((t) => t.creature.abilityText)
}

export function globalExtraDraw(state: GameState): boolean {
  return globalTexts(state).some((t) => /draw two|draws two|two cards when drawing/i.test(t))
}

export function globalBattleRegen(state: GameState): boolean {
  return globalTexts(state).some((t) => /regenerates/i.test(t))
}

export function globalDefenderAttacksFirst(state: GameState): boolean {
  return globalTexts(state).some((t) => /defend(?:ing|er).{0,40}attacks\s*first|all defending/i.test(t))
}

export function globalDisableTerritoryAbility(state: GameState): boolean {
  return globalTexts(state).some((t) => /cannot use territory abilities/i.test(t))
}

export function applyBattleGlobals(
  state: GameState,
  creature: MatchCard,
  role: 'attacker' | 'defender'
): MatchCard {
  const keywords = [...creature.keywords]
  if (globalBattleRegen(state) && !keywords.includes('regenerates')) {
    keywords.push('regenerates')
  }
  if (
    role === 'defender' &&
    globalDefenderAttacksFirst(state) &&
    !keywords.includes('attacks_first')
  ) {
    keywords.push('attacks_first')
  }
  return { ...creature, keywords }
}

/** Lead Idol also says Global Ability: Disables Move and Exchange — match disable move without requiring "global" if keyword set. */
export function moveDisabledByGlobal(state: GameState): boolean {
  return state.territories.some((t) => {
    if (!t.creature.keywords.includes('global')) return false
    return /disables?\s*move/i.test(t.creature.abilityText)
  })
}
