import { listSagaCards } from '../cards/catalog'
import type { SagaCard } from '../cards/types'
import type { Keyword, MatchCard } from './types'

let instanceSeq = 0

export function resetInstanceIds(): void {
  instanceSeq = 0
}

function nextInstanceId(catalogId: string): string {
  instanceSeq += 1
  return `${catalogId}#${instanceSeq}`
}

export function parseKeywords(abilityText: string): {
  keywords: Keyword[]
  itemBonusSt: number
  itemBonusHp: number
} {
  const keywords: Keyword[] = []
  let itemBonusSt = 0
  let itemBonusHp = 0
  const text = abilityText

  if (/attacks\s*first/i.test(text)) {
    keywords.push('attacks_first')
  }

  const stMatch = text.match(/\bST\s*\+\s*(\d+)/i)
  if (stMatch) {
    keywords.push('item_st')
    itemBonusSt = Number(stMatch[1])
  }
  const hpMatch = text.match(/\bHP\s*\+\s*(\d+)/i)
  if (hpMatch) {
    keywords.push('item_hp')
    itemBonusHp = Number(hpMatch[1])
  }

  return { keywords, itemBonusSt, itemBonusHp }
}

export function sagaCardToMatchCard(card: SagaCard): MatchCard {
  const { keywords, itemBonusSt, itemBonusHp } = parseKeywords(card.abilityText)
  return {
    instanceId: nextInstanceId(card.id),
    catalogId: card.id,
    name: card.name,
    kind: card.kind,
    element: card.element,
    st: card.st ?? 0,
    hp: card.hp ?? 0,
    mhp: card.mhp ?? card.hp ?? 0,
    cost: card.cost,
    abilityText: card.abilityText,
    keywords,
    itemBonusSt,
    itemBonusHp
  }
}

export function cloneMatchCard(card: MatchCard): MatchCard {
  return { ...card, keywords: [...card.keywords] }
}

export function cloneHand(hand: MatchCard[]): MatchCard[] {
  return hand.map(cloneMatchCard)
}

/** Stable starter books for Free Battle Phase 1 (50 cards each). */
export function buildStarterBook(seed: number): MatchCard[] {
  const all = listSagaCards()
  const creatures = all.filter((c) => c.kind === 'creature' && c.element !== 'dual' && !c.special)
  const items = all.filter((c) => c.kind === 'item')
  const spells = all.filter((c) => c.kind === 'spell')

  const pick = <T,>(arr: T[], count: number, offset: number): T[] => {
    const out: T[] = []
    for (let i = 0; i < count; i++) {
      out.push(arr[(offset + i * 3) % arr.length])
    }
    return out
  }

  const chosen = [
    ...pick(creatures, 34, seed),
    ...pick(items, 8, seed + 11),
    ...pick(spells, 8, seed + 29)
  ]

  return chosen.map(sagaCardToMatchCard)
}

export function shuffleInPlace<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
