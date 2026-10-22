import { landEffectBonus, squareById } from './board'
import { applyBattleGlobals } from './globals'
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
): { st: number; hp: number } {
  const land = scrollBattle ? 0 : landEffectBonus(creature.element ?? undefined, square, level)
  const st = creature.st + land + (item?.itemBonusSt ?? 0)
  const hp = creature.hp + land + (item?.itemBonusHp ?? 0)
  return { st, hp }
}

function applyCritical(st: number, hasCritical: boolean): number {
  return hasCritical ? Math.floor(st * 1.5) : st
}

export type PreFightStats = {
  item: MatchCard | null
  itemEffective: boolean
  attackerSt: number
  defenderSt: number
  attackerHp: number
  defenderHp: number
}

export function preFightStats(ants: Battleants): PreFightStats {
  const equipped = effectiveItem(ants.attacker, ants.item, ants.defender)
  const scrollBattle =
    ants.attacker.keywords.includes('scroll_attack') || equipped?.itemCategory === 'scroll'
  const atkBase = combatStats(ants.attacker, ants.square, ants.landLevel, equipped, scrollBattle)
  const defBase = combatStats(ants.defender, ants.square, ants.landLevel, null, scrollBattle)
  const atkCritical =
    ants.attacker.keywords.includes('critical_hit') ||
    (scrollBattle &&
      /scroll\s*critical/i.test(ants.attacker.abilityText + (equipped?.abilityText ?? '')))
  const defCritical = ants.defender.keywords.includes('critical_hit')
  return {
    item: ants.item,
    itemEffective: Boolean(ants.item) && equipped != null,
    attackerSt: applyCritical(atkBase.st, atkCritical),
    defenderSt: applyCritical(defBase.st, defCritical),
    attackerHp: atkBase.hp,
    defenderHp: defBase.hp
  }
}

function packOutcome(
  ants: Battleants,
  stats: PreFightStats,
  atkHp: number,
  defHp: number,
  attackerWins: boolean,
  message: string
): BattleOutcome {
  return {
    attackerWins,
    attackerRemainingHp: atkHp,
    defenderRemainingHp: defHp,
    message,
    attacker: ants.attacker,
    defender: ants.defender,
    item: ants.item,
    attackerSt: stats.attackerSt,
    defenderSt: stats.defenderSt,
    attackerHp: stats.attackerHp,
    defenderHp: stats.defenderHp,
    squareName: ants.square.name,
    landLevel: ants.landLevel
  }
}

/**
 * Saga-style sequential strikes with Phase-3A keywords.
 */
export function resolveBattle(ants: Battleants): BattleOutcome {
  const { attacker, defender } = ants
  const stats = preFightStats(ants)
  const item = effectiveItem(attacker, ants.item, defender)
  const scrollBattle =
    attacker.keywords.includes('scroll_attack') || item?.itemCategory === 'scroll'

  const atkSt = stats.attackerSt
  const defSt = stats.defenderSt
  let atkHp = stats.attackerHp
  let defHp = stats.defenderHp

  // Instant Death: if attacker's ST >= defender HP before strikes, defender dies
  if (attacker.keywords.includes('instant_death') && atkSt >= defHp) {
    return packOutcome(
      ants,
      stats,
      atkHp,
      0,
      true,
      `${attacker.name} lands Instant Death on ${defender.name}!`
    )
  }

  const attackerFirst = attacker.keywords.includes('attacks_first')
  const strike = (fromSt: number, toHp: number): number => Math.max(0, toHp - fromSt)

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

  return packOutcome(ants, stats, atkHp, defHp, attackerWins, message)
}

/** +10 ST/HP when another matching-element creature is in play. */
export function synergyBonus(state: GameState, creature: MatchCard, squareId: number): number {
  if (!/synergy/i.test(creature.abilityText)) return 0
  const typeMatch = creature.abilityText.match(/synergy\s*:\s*(fire|water|earth|air|neutral)/i)
  const want = (typeMatch?.[1] ?? creature.element)?.toLowerCase()
  if (!want || want === 'dual') return 0
  const other = state.territories.some(
    (t) => t.squareId !== squareId && t.creature.element === want
  )
  return other ? 10 : 0
}

function withSynergy(state: GameState, creature: MatchCard, squareId: number): MatchCard {
  const bonus = synergyBonus(state, creature, squareId)
  if (!bonus) return creature
  return { ...creature, st: creature.st + bonus, hp: creature.hp + bonus }
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
    attacker: withSynergy(state, applyBattleGlobals(state, attacker, 'attacker'), squareId),
    defender: withSynergy(state, applyBattleGlobals(state, terr.creature, 'defender'), squareId),
    item,
    square,
    landLevel: terr.level
  })
}

export type CombatViewModel = {
  attacker: MatchCard
  defender: MatchCard
  item: MatchCard | null
  itemEffective: boolean
  attackerSt: number
  defenderSt: number
  attackerHp: number
  defenderHp: number
  attackerRemainingHp: number
  defenderRemainingHp: number
  squareName: string
  landLevel: number
  message: string | null
  resolved: boolean
  attackerWins: boolean
}

function battleantsFromPending(state: GameState, item: MatchCard | null): Battleants | null {
  const player = state.players[state.currentPlayerIndex]
  if (!player) return null
  const attacker = player.hand.find((c) => c.instanceId === state.pendingAttackerId)
  const squareId = state.selectedSquareId ?? player.position
  const terr = state.territories.find((t) => t.squareId === squareId)
  if (!attacker || !terr) return null
  const square = squareById(state.config.board, squareId)
  return {
    attacker: withSynergy(state, applyBattleGlobals(state, attacker, 'attacker'), squareId),
    defender: withSynergy(state, applyBattleGlobals(state, terr.creature, 'defender'), squareId),
    item,
    square,
    landLevel: terr.level
  }
}

/** Live combat panel: item-select preview or resolved last battle. */
export function combatViewFromState(
  state: GameState,
  previewItem: MatchCard | null = null
): CombatViewModel | null {
  if (state.phase === 'battle_result' && state.lastBattle?.attacker) {
    const b = state.lastBattle
    return {
      attacker: b.attacker,
      defender: b.defender,
      item: b.item,
      itemEffective: Boolean(b.item),
      attackerSt: b.attackerSt,
      defenderSt: b.defenderSt,
      attackerHp: b.attackerHp,
      defenderHp: b.defenderHp,
      attackerRemainingHp: b.attackerRemainingHp,
      defenderRemainingHp: b.defenderRemainingHp,
      squareName: b.squareName,
      landLevel: b.landLevel,
      message: b.message,
      resolved: true,
      attackerWins: b.attackerWins
    }
  }
  if (state.phase !== 'select_item') return null
  const ants = battleantsFromPending(state, previewItem)
  if (!ants) return null
  const stats = preFightStats(ants)
  return {
    attacker: ants.attacker,
    defender: ants.defender,
    item: stats.item,
    itemEffective: stats.itemEffective,
    attackerSt: stats.attackerSt,
    defenderSt: stats.defenderSt,
    attackerHp: stats.attackerHp,
    defenderHp: stats.defenderHp,
    attackerRemainingHp: stats.attackerHp,
    defenderRemainingHp: stats.defenderHp,
    squareName: ants.square.name,
    landLevel: ants.landLevel,
    message: null,
    resolved: false,
    attackerWins: false
  }
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
export function computeAttackPower(
  creature: { attack?: number; st?: number; element: string },
  square: Square
): number {
  const st = creature.st ?? creature.attack ?? 0
  return st + landEffectBonus(creature.element as never, square, 1)
}

export function computeDefensePower(
  creature: { defense?: number; hp?: number; element: string },
  square: Square
): number {
  const hp = creature.hp ?? creature.defense ?? 0
  return hp + landEffectBonus(creature.element as never, square, 1)
}

export function elementAdvantageBonus(): number {
  return 0
}

export function tollAmount(square: Square): number {
  return Math.floor(square.landValue * 0.5)
}
