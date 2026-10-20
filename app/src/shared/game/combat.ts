import { landEffectBonus, squareById } from './board'
import type { BattleOutcome, GameState, MatchCard, Square } from './types'

export type Battleants = {
  attacker: MatchCard
  defender: MatchCard
  item: MatchCard | null
  square: Square
  landLevel: number
}

function combatStats(creature: MatchCard, square: Square, level: number, item: MatchCard | null) {
  const land = landEffectBonus(creature.element ?? undefined, square, level)
  const st = creature.st + land + (item?.itemBonusSt ?? 0)
  const hp = creature.hp + land + (item?.itemBonusHp ?? 0)
  return { st, hp }
}

/**
 * Saga-style sequential strikes. Attacks First on the attacker means they
 * strike before the defender can counter; if the defender dies, no counter.
 */
export function resolveBattle(ants: Battleants): BattleOutcome {
  const { attacker, defender, item, square, landLevel } = ants
  const atk = combatStats(attacker, square, landLevel, item)
  const def = combatStats(defender, square, landLevel, null)

  let atkHp = atk.hp
  let defHp = def.hp
  const attackerFirst = attacker.keywords.includes('attacks_first')

  const strike = (fromSt: number, toHp: number) => Math.max(0, toHp - fromSt)

  if (attackerFirst) {
    defHp = strike(atk.st, defHp)
    if (defHp > 0) {
      atkHp = strike(def.st, atkHp)
    }
  } else {
    // Simultaneous damage snapshot
    const nextDef = strike(atk.st, defHp)
    const nextAtk = strike(def.st, atkHp)
    defHp = nextDef
    atkHp = nextAtk
  }

  const attackerWins = defHp <= 0 && atkHp > 0
  // If both die, defender holds the land (invasion fails)
  const holds = !attackerWins

  const message = attackerWins
    ? `${attacker.name} invades! (${atk.st} ST) ${defender.name} falls.`
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
