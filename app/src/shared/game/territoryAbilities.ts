import { cloneHand, cloneMatchCard, territoryAbilityCost } from './matchCards'
import type { GameState, MatchCard, Player } from './types'

export type AbilityResult = {
  state: GameState
  message: string
  handled: boolean
}

function withPlayer(state: GameState, player: Player): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? player : p))
  }
}

function withPlayers(state: GameState, players: Player[]): GameState {
  return { ...state, players }
}

export function territoryAbilityHasHandledEffect(text: string): boolean {
  return (
    /\bfog\b|toll.{0,24}(?:1\s*\/\s*2|half|halved)/i.test(text) ||
    /deals?\s+\d+\s+damage/i.test(text) ||
    /destroys?\s+(?:target\s+)?(?:enemy\s+)?creature|destroys?\s+all\s+enemy/i.test(text) ||
    /(?:gains?|user\s+gains?|receives?)\s+\d+\s*G/i.test(text) ||
    /(?:steals?|takes?)\s+\d+\s*G/i.test(text) ||
    /(?:hp|mhp)\s*\+\s*\d+|restores?\s+\d+\s*hp|heals?\s+\d+/i.test(text) ||
    /returns?\s+(?:target\s+)?(?:enemy\s+)?creature\s+to\s+(?:its\s+)?(?:owner'?s\s+)?hand/i.test(text)
  )
}

export function tryResolveTerritoryAbility(
  state: GameState,
  caster: Player,
  creature: MatchCard,
  squareId: number
): AbilityResult {
  const cost = territoryAbilityCost(creature)
  if (caster.magic < cost) {
    return { state, message: 'Not enough magic.', handled: false }
  }
  let player = { ...caster, magic: caster.magic - cost }
  const text = creature.abilityText

  if (/\bfog\b|toll.{0,24}(?:1\s*\/\s*2|half|halved)/i.test(text)) {
    const territories = state.territories.map((t) =>
      t.squareId === squareId ? { ...t, tollHalved: true } : t
    )
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} uses ${creature.name}'s ability (Fog — toll halved).`,
      handled: true
    }
  }

  if (/destroys?\s+all\s+enemy/i.test(text)) {
    const territories = state.territories.filter((t) => t.ownerId === caster.id)
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} uses ${creature.name} (enemy creatures destroyed).`,
      handled: true
    }
  }

  if (/destroys?\s+(?:target\s+)?(?:enemy\s+)?creature/i.test(text)) {
    const enemies = state.territories
      .filter((t) => t.ownerId !== caster.id)
      .sort((a, b) => a.creature.hp - b.creature.hp)
    if (enemies.length === 0) {
      return {
        state: withPlayer(state, player),
        message: `${caster.name} uses ${creature.name} (no enemy creatures).`,
        handled: true
      }
    }
    const target = enemies[0]
    const territories = state.territories.filter((t) => t.squareId !== target.squareId)
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} uses ${creature.name} (destroys ${target.creature.name}).`,
      handled: true
    }
  }

  const dmg = text.match(/deals?\s+(\d+)\s+damage/i)
  if (dmg) {
    const amount = Number(dmg[1])
    const enemies = state.territories
      .filter((t) => t.ownerId !== caster.id)
      .sort((a, b) => a.creature.hp - b.creature.hp)
    if (enemies.length === 0) {
      return {
        state: withPlayer(state, player),
        message: `${caster.name} uses ${creature.name} (no targets).`,
        handled: true
      }
    }
    const targetId = enemies[0].squareId
    const territories = state.territories
      .map((t) => {
        if (t.squareId !== targetId) return t
        const hp = Math.max(0, t.creature.hp - amount)
        if (hp <= 0) return null
        return { ...t, creature: { ...t.creature, hp } }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} uses ${creature.name} (${amount} damage).`,
      handled: true
    }
  }

  const steal = text.match(/(?:steals?|takes?)\s+(\d+)\s*G/i)
  if (steal) {
    const amount = Number(steal[1])
    let remaining = amount
    const adjusted = state.players.map((p) => {
      if (p.id === caster.id) return p
      if (remaining <= 0) return p
      const take = Math.min(remaining, p.magic)
      remaining -= take
      return { ...p, magic: p.magic - take }
    })
    const stolen = amount - remaining
    const casterUpdated = { ...player, magic: player.magic + stolen }
    const finalPlayers = adjusted.map((p) => (p.id === caster.id ? casterUpdated : p))
    return {
      state: withPlayers(state, finalPlayers),
      message: `${caster.name} uses ${creature.name} (steals ${stolen}G).`,
      handled: true
    }
  }

  const gain = text.match(/(?:gains?|user\s+gains?|receives?)\s+(\d+)\s*G/i)
  if (gain) {
    player = { ...player, magic: player.magic + Number(gain[1]) }
    return {
      state: withPlayer(state, player),
      message: `${caster.name} uses ${creature.name} (+${gain[1]}G).`,
      handled: true
    }
  }

  const heal = text.match(/(?:restores?|heals?)\s+(\d+)\s*(?:hp|mhp)?/i) || text.match(/hp\s*\+\s*(\d+)/i)
  if (heal && !/enemy/i.test(text)) {
    const amount = Number(heal[1])
    const territories = state.territories.map((t) => {
      if (t.ownerId !== caster.id) return t
      const hp = Math.min(t.creature.mhp, t.creature.hp + amount)
      return { ...t, creature: { ...t.creature, hp } }
    })
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} uses ${creature.name} (heals +${amount} HP).`,
      handled: true
    }
  }

  if (/returns?\s+(?:target\s+)?(?:enemy\s+)?creature\s+to\s+(?:its\s+)?(?:owner'?s\s+)?hand/i.test(text)) {
    const enemies = state.territories
      .filter((t) => t.ownerId !== caster.id)
      .sort((a, b) => a.creature.hp - b.creature.hp)
    if (enemies.length === 0) {
      return {
        state: withPlayer(state, player),
        message: `${caster.name} uses ${creature.name} (no enemy creatures).`,
        handled: true
      }
    }
    const target = enemies[0]
    const territories = state.territories.filter((t) => t.squareId !== target.squareId)
    const returned = cloneMatchCard(target.creature)
    returned.hp = returned.mhp
    const players = state.players.map((p) => {
      if (p.id === caster.id) return player
      if (p.id !== target.ownerId) return p
      if (p.hand.length >= state.config.handLimit) {
        return { ...p, discard: [...p.discard, returned] }
      }
      return { ...p, hand: [...cloneHand(p.hand), returned] }
    })
    return {
      state: { ...withPlayers(state, players), territories },
      message: `${caster.name} uses ${creature.name} (returns ${target.creature.name} to hand).`,
      handled: true
    }
  }

  return {
    state: withPlayer(state, player),
    message: `${caster.name} uses ${creature.name} (effect not fully simulated).`,
    handled: true
  }
}
