import type { GameState, MatchCard } from './types'

function globalTexts(state: GameState): string[] {
  const fromCreatures = state.territories
    .filter((t) => t.creature.keywords.includes('global'))
    .map((t) => t.creature.abilityText)
  return [...fromCreatures, ...(state.worldTexts ?? [])]
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
  return globalTexts(state).some((t) =>
    /cannot use territory abilities|abilities do not activate|abilities disabled/i.test(t)
  )
}

export function globalIgnoreLandLimits(state: GameState): boolean {
  return globalTexts(state).some((t) =>
    /requirements for summoning|other than magic cost are ignored|costs besides magic are ignored/i.test(
      t
    )
  )
}

export function globalBlockTransform(state: GameState): boolean {
  return globalTexts(state).some((t) => /land transformation/i.test(t))
}

export function globalUniqueInPlay(state: GameState): boolean {
  return globalTexts(state).some((t) => /same type as those already in play cannot be summoned/i.test(t))
}

export function spellAbilityDamageReduction(state: GameState): number {
  for (const text of globalTexts(state)) {
    const m = text.match(/damage to all creatures from spells and territory abilities is reduced by (\d+)/i)
    if (m) return Number(m[1])
  }
  return 0
}

export function reducedAbilityDamage(state: GameState, amount: number): number {
  return Math.max(0, amount - spellAbilityDamageReduction(state))
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
