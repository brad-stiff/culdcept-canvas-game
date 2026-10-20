import { landEffectBonus, squareById } from './board'
import type { BattleOutcome, GameState, MatchCard, Square } from './types'

export type Battleants = {
  attacker: MatchCard
  defender: MatchCard
  item: MatchCard | null
  square: Square
  landLevel: number
}

function effectiveItem(
  creature: MatchCard,
  item: MatchCard | null,
  foe: MatchCard
): MatchCard | null {
  if (!item) return null
  if (item.kind === 'creature') {
    // Support / Item Creature: contribute ST/HP as bonuses
    return {
      ...item,
      itemBonusSt: item.st,
      itemBonusHp: item.hp,
      itemCategory: null
    }
  }
  const cat = item.itemCategory
  if (cat === 'weapon' && foe.keywords.includes('neutralizes_weapon')) return null
  if (cat === 'armor' && foe.keywords.includes('neutralizes_armor')) return null
  if (cat === 'scroll' && foe.keywords.includes('neutralizes_scroll')) return null
  if (creature.itemLimits.includes(cat as never)) return null
  return item
}

function combatStats(
  creature: MatchCard,
  square: Square,
  level: number,
  item: MatchCard | null,
  scrollBattle: boolean
) {
  const land = scrollBattle ? 0 : landEffectBonus(creature.element ?? undefined, square, level)
  const st = creature.st + land + (item?.itemBonusSt ?? 0)
  const hp = creature.hp + land + (item?.itemBonusHp ?? 0)
  return { st, hp }
}

function applyCritical(st: number, hasCritical: boolean): number {
  return hasCritical ? Math.floor(st * 1.5) : st
}

/**
 * Saga-style sequential strikes with Phase-3A keywords.
 */
export function resolveBattle(ants: Battleants): BattleOutcome {
  const { attacker, defender, item: rawItem, square, landLevel } = ants
  const item = effectiveItem(attacker, rawItem, defender)
  const scrollBattle =
    attacker.keywords.includes('scroll_attack') || item?.itemCategory === 'scroll'

  const atkBase = combatStats(attacker, square, landLevel, item, scrollBattle)
  const defBase = combatStats(defender, square, landLevel, null, scrollBattle)

  const atkCritical =
    attacker.keywords.includes('critical_hit') ||
    (scrollBattle && /scroll\s*critical/i.test(attacker.abilityText + (item?.abilityText ?? '')))
  const defCritical = defender.keywords.includes('critical_hit')

  let atkSt = applyCritical(atkBase.st, atkCritical)
  const defSt = applyCritical(defBase.st, defCritical)

  let atkHp = atkBase.hp
  let defHp = defBase.hp

  // Instant Death: if attacker's ST >= defender HP before strikes, defender dies
  if (attacker.keywords.includes('instant_death') && atkSt >= defHp) {
    return {
      attackerWins: true,
      attackerRemainingHp: atkHp,
      defenderRemainingHp: 0,
      message: `${attacker.name} lands Instant Death on ${defender.name}!`
    }
  }

  const attackerFirst = attacker.keywords.includes('attacks_first')
  const strike = (fromSt: number, toHp: number) => Math.max(0, toHp - fromSt)

  if (scrollBattle) {
    // Scroll: attacker deals ST damage; defender does not counter with normal ST
    defHp = strike(atkSt, defHp)
  } else if (attackerFirst) {
    defHp = strike(atkSt, defHp)
    if (defHp > 0) {
      atkHp = strike(defSt, atkHp)
    }
  } else {
    const nextDef = strike(atkSt, defHp)
    const nextAtk = strike(defSt, atkHp)
    defHp = nextDef
    atkHp = nextAtk
  }

  // Regenerates: survivors restore to MHP (simplified: full MHP if still alive)
  if (defHp > 0 && defender.keywords.includes('regenerates')) {
    defHp = Math.max(defHp, defender.mhp)
  }
  if (atkHp > 0 && attacker.keywords.includes('regenerates')) {
    atkHp = Math.max(atkHp, attacker.mhp)
  }

  const attackerWins = defHp <= 0 && atkHp > 0
  const holds = !attackerWins

  const message = attackerWins
    ? `${attacker.name} invades! (${atkSt} ST) ${defender.name} falls.`
    : holds && defHp <= 0 && atkHp <= 0
      ? `Mutual destruction — ${defender.name}'s side holds the land.`
      : `${defender.name} holds the land (${defHp} HP left).`

  return {
    attackerWins,
    attackerRemainingHp: atkHp,
    defenderRemainingHp: defHp,
    message
  }
}

export function resolveBattleFromState(
  state: GameState,
  attacker: MatchCard,
  item: MatchCard | null,
  squareId: number
): BattleOutcome {
  const terr = state.territories.find((t) => t.squareId === squareId)
  if (!terr) {
    throw new Error('No defender territory')
  }
  const square = squareById(state.config.board, squareId)
  return resolveBattle({
    attacker,
    defender: terr.creature,
    item,
    square,
    landLevel: terr.level
  })
}

/** Estimate attacker ST vs defender HP for AI decisions. */
export function estimateInvasionFavorable(
  attacker: MatchCard,
  defender: MatchCard,
  square: Square,
  landLevel: number,
  item: MatchCard | null
): boolean {
  const outcome = resolveBattle({ attacker, defender, item, square, landLevel })
  return outcome.attackerWins
}

/** @deprecated Phase-0 helpers kept for transitional tests — prefer resolveBattle. */
export function computeAttackPower(creature: { attack?: number; st?: number; element: string }, square: Square): number {
  const st = creature.st ?? creature.attack ?? 0
  return st + landEffectBonus(creature.element as never, square, 1)
}

export function computeDefensePower(creature: { defense?: number; hp?: number; element: string }, square: Square): number {
  const hp = creature.hp ?? creature.defense ?? 0
  return hp + landEffectBonus(creature.element as never, square, 1)
}

export function elementAdvantageBonus(): number {
  return 0
}

export function tollAmount(square: Square): number {
  return Math.floor(square.landValue * 0.5)
}
