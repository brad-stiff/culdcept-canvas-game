import type { BattleOutcome, CreatureCard, Element, Square } from './types'

const TERRAIN_BONUS = 30
const ELEMENT_ADVANTAGE_BONUS = 25

/** fire > earth > air > water > fire */
const BEATS: Record<Element, Element | null> = {
  neutral: null,
  fire: 'earth',
  earth: 'air',
  air: 'water',
  water: 'fire'
}

export function terrainBonus(element: Element, terrain: Element): number {
  if (element === 'neutral' || terrain === 'neutral') {
    return 0
  }
  return element === terrain ? TERRAIN_BONUS : 0
}

export function elementAdvantageBonus(attackerElement: Element, defenderElement: Element): number {
  if (BEATS[attackerElement] === defenderElement) {
    return ELEMENT_ADVANTAGE_BONUS
  }
  if (BEATS[defenderElement] === attackerElement) {
    return -ELEMENT_ADVANTAGE_BONUS
  }
  return 0
}

export function computeAttackPower(creature: CreatureCard, square: Square): number {
  return creature.attack + terrainBonus(creature.element, square.terrain)
}

export function computeDefensePower(creature: CreatureCard, square: Square): number {
  return creature.defense + terrainBonus(creature.element, square.terrain)
}

export function resolveBattle(
  attacker: CreatureCard,
  defender: CreatureCard,
  square: Square
): BattleOutcome {
  const advantage = elementAdvantageBonus(attacker.element, defender.element)
  const attackPower = computeAttackPower(attacker, square) + advantage
  const defensePower = computeDefensePower(defender, square)
  const attackerWins = attackPower > defensePower

  const message = attackerWins
    ? `${attacker.name} (${attackPower}) defeats ${defender.name} (${defensePower})!`
    : `${defender.name} holds (${defensePower}) vs ${attacker.name} (${attackPower}).`

  return { attackerWins, attackPower, defensePower, message }
}

export function tollAmount(square: Square): number {
  return square.tollBase
}
