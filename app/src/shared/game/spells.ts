import type { GameState, MatchCard, Player } from './types'
import { cloneHand, cloneMatchCard } from './matchCards'

export type SpellResult = {
  state: GameState
  message: string
  handled: boolean
}

function withPlayer(state: GameState, player: Player): GameState {
  const players = [...state.players] as [Player, Player]
  players[player.id as 0 | 1] = player
  return { ...state, players }
}

/** Phase-1 spell subset: draw, gain magic, chip damage to a random enemy creature. */
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

  // Draw effects
  if (/draws?\s+a\s+card|user\s+draws/i.test(text)) {
    const drawn = drawOne(player, state.config.handLimit)
    player = drawn.player
    return {
      state: withPlayer(state, player),
      message: `${caster.name} casts ${spell.name} and draws.`,
      handled: true
    }
  }

  // Gain magic
  const gain = text.match(/(?:gains?|user\s+gains?)\s+(\d+)\s*G/i)
  if (gain) {
    player = { ...player, magic: player.magic + Number(gain[1]) }
    return {
      state: withPlayer(state, player),
      message: `${caster.name} casts ${spell.name} (+${gain[1]}G).`,
      handled: true
    }
  }

  // Flat damage to creatures
  const dmg = text.match(/deals?\s+(\d+)\s+damage/i)
  if (dmg) {
    const amount = Number(dmg[1])
    const enemyId = caster.id === 0 ? 1 : 0
    const territories = state.territories.map((t) => {
      if (t.ownerId !== enemyId) return t
      const hp = Math.max(1, t.creature.hp - amount)
      return { ...t, creature: { ...t.creature, hp, mhp: Math.max(t.creature.mhp, hp) } }
    })
    return {
      state: { ...withPlayer(state, player), territories },
      message: `${caster.name} casts ${spell.name} (${amount} damage to enemy creatures).`,
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
    // reshuffle without importing shuffle to avoid cycles — Fisher-Yates inline
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
