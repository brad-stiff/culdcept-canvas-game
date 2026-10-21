import { reducedAbilityDamage } from './globals'
import { cloneHand, cloneMatchCard } from './matchCards'
import type { GameState, MatchCard, Player } from './types'

export type SpellResult = {
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

/** Whether ability text matches a handled Phase-3A spell pattern (for AI). */
export function spellHasHandledEffect(text: string): boolean {
  return (
    /draws?\s+(?:a|\d+)\s+cards?|user\s+draws/i.test(text) ||
    /(?:gains?|user\s+gains?|receives?)\s+\d+\s*G/i.test(text) ||
    /(?:steals?|takes?)\s+\d+\s*G/i.test(text) ||
    /(?:loses?|enemy\s+cepter\s+loses?)\s+\d+\s*G/i.test(text) ||
    /deals?\s+\d+\s+damage/i.test(text) ||
    /destroys?\s+(?:target\s+)?(?:enemy\s+)?creature|destroys?\s+all\s+enemy/i.test(text) ||
    /(?:hp|mhp)\s*[+\-]\s*\d+|restores?\s+\d+\s*hp|heals?\s+\d+/i.test(text) ||
    /discards?\s+(?:a|\d+)\s+cards?/i.test(text) ||
    /returns?\s+(?:target\s+)?(?:enemy\s+)?creature\s+to\s+(?:its\s+)?(?:owner'?s\s+)?hand/i.test(text)
  )
}

/** Phase-3A spell patterns: draw, magic, damage, destroy, heal, discard, return. */
export function tryResolveSpell(state: GameState, caster: Player, spell: MatchCard): SpellResult {
  const text = spell.abilityText
  let player = {
    ...caster,
    hand: caster.hand.filter((c) => c.instanceId !== spell.instanceId),
    discard: [...caster.discard, cloneMatchCard(spell)],
    magic: caster.magic - spell.cost
  }
  if (player.magic < 0) {
    return { state, message: 'Not enough magic.', handled: false }
  }

  // Draw N cards
  const drawN = text.match(/draws?\s+(\d+)\s+cards?/i)
  if (drawN || /draws?\s+a\s+card|user\s+draws/i.test(text)) {
    const n = drawN ? Number(drawN[1]) : 1
    let drewNames: string[] = []
    for (let i = 0; i < n; i++) {
      const drawn = drawOne(player, state.config.handLimit)
      player = drawn.player
      if (drawn.drew) drewNames.push(drawn.drew.name)
    }
    return {
      state: withPlayer(state, player),
      message:
        drewNames.length > 0
          ? `${caster.name} casts ${spell.name} and draws ${drewNames.join(', ')}.`
          : `${caster.name} casts ${spell.name} (no cards drawn).`,
      handled: true
    }
  }

  // Steal magic from enemies (total amount across enemies in seat order)
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
      message: `${caster.name} casts ${spell.name} (steals ${stolen}G).`,
      handled: true
    }
  }

  // Enemy loses magic
  const lose = text.match(/(?:enemy\s+cepter\s+)?loses?\s+(\d+)\s*G/i)
  if (lose && !/(?:user|caster)\s+loses?/i.test(text)) {
    const amount = Number(lose[1])
    const players = state.players.map((p) => {
      if (p.id === caster.id) return player
      return { ...p, magic: Math.max(0, p.magic - amount) }
    })
    return {
      state: withPlayers(state, players),
      message: `${caster.name} casts ${spell.name} (enemies −${amount}G).`,
      handled: true
    }
  }

  // Gain magic
  const gain = text.match(/(?:gains?|user\s+gains?|receives?)\s+(\d+)\s*G/i)
  if (gain) {
    player = { ...player, magic: player.magic + Number(gain[1]) }
    return {
      state: withPlayer(state, player),
      message: `${caster.name} casts ${spell.name} (+${gain[1]}G).`,
      handled: true
    }
  }

  // Destroy all enemy creatures
  if (/destroys?\s+all\s+enemy/i.test(text)) {
    const territories = state.territories.filter((t) => t.ownerId === caster.id)
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} casts ${spell.name} (enemy creatures destroyed).`,
      handled: true
    }
  }

  // Destroy target / a creature — destroy weakest enemy creature
  if (/destroys?\s+(?:target\s+)?(?:enemy\s+)?creature/i.test(text)) {
    const enemies = state.territories
      .filter((t) => t.ownerId !== caster.id)
      .sort((a, b) => a.creature.hp - b.creature.hp)
    if (enemies.length === 0) {
      return {
        state: withPlayer(state, player),
        message: `${caster.name} casts ${spell.name} (no enemy creatures).`,
        handled: true
      }
    }
    const target = enemies[0]
    const territories = state.territories.filter((t) => t.squareId !== target.squareId)
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} casts ${spell.name} (destroys ${target.creature.name}).`,
      handled: true
    }
  }

  // Flat damage to creatures
  const dmg = text.match(/deals?\s+(\d+)\s+damage/i)
  if (dmg) {
    const amount = reducedAbilityDamage(state, Number(dmg[1]))
    const allEnemy = /all\s+enemy|each\s+enemy|every\s+enemy/i.test(text)
    const territories = state.territories
      .map((t) => {
        if (t.ownerId === caster.id) return t
        const hp = Math.max(0, t.creature.hp - amount)
        if (hp <= 0) return null
        return { ...t, creature: { ...t.creature, hp } }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)

    // If not "all", only hit the weakest enemy once — approximate by damaging all when text says all
    if (!allEnemy) {
      const enemies = state.territories
        .filter((t) => t.ownerId !== caster.id)
        .sort((a, b) => a.creature.hp - b.creature.hp)
      if (enemies.length === 0) {
        return {
          state: withPlayer(state, player),
          message: `${caster.name} casts ${spell.name} (no targets).`,
          handled: true
        }
      }
      const targetId = enemies[0].squareId
      const single = state.territories
        .map((t) => {
          if (t.squareId !== targetId) return t
          const hp = Math.max(0, t.creature.hp - amount)
          if (hp <= 0) return null
          return { ...t, creature: { ...t.creature, hp } }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
      return {
        state: { ...withPlayer(state, player), territories: single },
        message: `${caster.name} casts ${spell.name} (${amount} damage).`,
        handled: true
      }
    }

    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} casts ${spell.name} (${amount} damage to enemy creatures).`,
      handled: true
    }
  }

  // Heal own creatures
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
      message: `${caster.name} casts ${spell.name} (heals own creatures +${amount} HP).`,
      handled: true
    }
  }

  // Discard cards from hand
  const discardN = text.match(/discards?\s+(\d+)\s+cards?/i) || (/discards?\s+a\s+card/i.test(text) ? ['', '1'] : null)
  if (discardN) {
    const n = Number(discardN[1])
    const toDiscard = player.hand.slice(0, n)
    player = {
      ...player,
      hand: player.hand.slice(n),
      discard: [...player.discard, ...toDiscard.map(cloneMatchCard)]
    }
    return {
      state: withPlayer(state, player),
      message: `${caster.name} casts ${spell.name} (discards ${toDiscard.length}).`,
      handled: true
    }
  }

  // Return enemy creature to hand
  if (/returns?\s+(?:target\s+)?(?:enemy\s+)?creature\s+to\s+(?:its\s+)?(?:owner'?s\s+)?hand/i.test(text)) {
    const enemies = state.territories
      .filter((t) => t.ownerId !== caster.id)
      .sort((a, b) => a.creature.hp - b.creature.hp)
    if (enemies.length === 0) {
      return {
        state: withPlayer(state, player),
        message: `${caster.name} casts ${spell.name} (no enemy creatures).`,
        handled: true
      }
    }
    const target = enemies[0]
    const territories = state.territories.filter((t) => t.squareId !== target.squareId)
    const owner = state.players.find((p) => p.id === target.ownerId)!
    const returned = cloneMatchCard(target.creature)
    returned.hp = returned.mhp
    const players = state.players.map((p) => {
      if (p.id === caster.id) return player
      if (p.id !== owner.id) return p
      if (p.hand.length >= state.config.handLimit) {
        return { ...p, discard: [...p.discard, returned] }
      }
      return { ...p, hand: [...cloneHand(p.hand), returned] }
    })
    return {
      state: { ...withPlayers(state, players), territories },
      message: `${caster.name} casts ${spell.name} (returns ${target.creature.name} to hand).`,
      handled: true
    }
  }

  // Fallback: pay cost, no further effect (still "handled" so the card is spent)
  return {
    state: withPlayer(state, player),
    message: `${caster.name} casts ${spell.name} (effect not fully simulated).`,
    handled: true
  }
}

export function drawOne(
  player: Player,
  handLimit: number
): { player: Player; drew: MatchCard | null } {
  if (player.hand.length >= handLimit) {
    return { player, drew: null }
  }
  let book = [...player.book]
  let discard = [...player.discard]
  if (book.length === 0) {
    if (discard.length === 0) return { player, drew: null }
    book = discard.map(cloneMatchCard)
    discard = []
    for (let i = book.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[book[i], book[j]] = [book[j], book[i]]
    }
  }
  const drew = book[0]
  return {
    player: {
      ...player,
      book: book.slice(1),
      discard,
      hand: [...cloneHand(player.hand), cloneMatchCard(drew)]
    },
    drew
  }
}

export function isCastableSpell(card: MatchCard, magic: number): boolean {
  return card.kind === 'spell' && card.cost <= magic
}
