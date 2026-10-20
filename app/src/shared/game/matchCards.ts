import { listSagaCards } from '../cards/catalog'
import type { SagaCard } from '../cards/types'
import type { Element, ItemCategory, Keyword, MatchCard } from './types'

let instanceSeq = 0

export function resetInstanceIds(): void {
  instanceSeq = 0
}

function nextInstanceId(catalogId: string): string {
  instanceSeq += 1
  return `${catalogId}#${instanceSeq}`
}

const ELEMENT_ALIASES: Record<string, Element> = {
  fire: 'fire',
  water: 'water',
  earth: 'earth',
  air: 'air',
  wind: 'air',
  neutral: 'neutral'
}

const ITEM_ALIASES: Record<string, ItemCategory> = {
  weapon: 'weapon',
  armor: 'armor',
  scroll: 'scroll',
  tool: 'tool'
}

function parseLandLimits(text: string): Element[] {
  const limits: Element[] = []
  const block = text.match(/land\s*limit\s*:?\s*([^/\n]+)/i)
  if (!block) return limits
  for (const raw of block[1].split(/[,&/]|and/i)) {
    const key = raw.trim().toLowerCase()
    const el = ELEMENT_ALIASES[key]
    if (el && !limits.includes(el)) limits.push(el)
  }
  return limits
}

function parseItemLimits(text: string): ItemCategory[] {
  const limits: ItemCategory[] = []
  const block = text.match(/item\s*limit\s*:?\s*([^/\n]+)/i)
  if (!block) return limits
  for (const raw of block[1].split(/[,&/]|and/i)) {
    const key = raw.trim().toLowerCase()
    const cat = ITEM_ALIASES[key]
    if (cat && !limits.includes(cat)) limits.push(cat)
  }
  return limits
}

function inferItemCategory(
  text: string,
  keywords: Keyword[],
  itemBonusSt: number,
  itemBonusHp: number
): ItemCategory | null {
  if (/scroll\s*attack|scroll\s*critical/i.test(text) || keywords.includes('scroll_attack')) {
    return 'scroll'
  }
  if (/\barmor\b|shield|helmet|mail|plate/i.test(text) || (itemBonusHp > 0 && itemBonusSt === 0)) {
    return 'armor'
  }
  if (/\bweapon\b|sword|axe|spear|bow|dagger|mace|blade/i.test(text) || itemBonusSt > 0) {
    return 'weapon'
  }
  if (/\btool\b/i.test(text)) return 'tool'
  return null
}

export function parseKeywords(abilityText: string): {
  keywords: Keyword[]
  itemBonusSt: number
  itemBonusHp: number
  itemCategory: ItemCategory | null
  landLimits: Element[]
  itemLimits: ItemCategory[]
} {
  const keywords: Keyword[] = []
  let itemBonusSt = 0
  let itemBonusHp = 0
  const text = abilityText

  if (/attacks\s*first/i.test(text)) keywords.push('attacks_first')
  if (/\bdefensive\b/i.test(text)) keywords.push('defensive')
  if (/scroll\s*attack/i.test(text)) keywords.push('scroll_attack')
  if (/critical\s*hit|scroll\s*critical/i.test(text)) keywords.push('critical_hit')
  if (/\bregenerates?\b/i.test(text)) keywords.push('regenerates')
  if (/instant\s*death/i.test(text)) keywords.push('instant_death')
  if (/\bsupport\b/i.test(text)) keywords.push('support')
  if (/item\s*creature/i.test(text)) keywords.push('item_creature')

  if (/neutralizes?\s*(?:effects?\s*of\s*)?weapons?/i.test(text) || /neutralizes?\s*weapon/i.test(text)) {
    keywords.push('neutralizes_weapon')
  }
  if (/neutralizes?\s*(?:effects?\s*of\s*)?armor/i.test(text) || /neutralizes?\s*armor/i.test(text)) {
    keywords.push('neutralizes_armor')
  }
  if (/neutralizes?\s*(?:effects?\s*of\s*)?scrolls?/i.test(text) || /neutralizes?\s*scroll/i.test(text)) {
    keywords.push('neutralizes_scroll')
  }
  // Broad "Neutralizes: X" lists
  if (/neutralizes?\s*:/i.test(text)) {
    const after = text.slice(text.search(/neutralizes?\s*:/i))
    if (/\bweapon/i.test(after)) keywords.push('neutralizes_weapon')
    if (/\barmor/i.test(after)) keywords.push('neutralizes_armor')
    if (/\bscroll/i.test(after)) keywords.push('neutralizes_scroll')
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

  const landLimits = parseLandLimits(text)
  const itemLimits = parseItemLimits(text)
  const itemCategory = inferItemCategory(text, keywords, itemBonusSt, itemBonusHp)

  return {
    keywords: [...new Set(keywords)],
    itemBonusSt,
    itemBonusHp,
    itemCategory,
    landLimits,
    itemLimits
  }
}

export function sagaCardToMatchCard(card: SagaCard): MatchCard {
  const parsed = parseKeywords(card.abilityText)
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
    keywords: parsed.keywords,
    itemBonusSt: parsed.itemBonusSt,
    itemBonusHp: parsed.itemBonusHp,
    itemCategory: card.kind === 'item' ? parsed.itemCategory : null,
    landLimits: parsed.landLimits,
    itemLimits: parsed.itemLimits
  }
}

export function cloneMatchCard(card: MatchCard): MatchCard {
  return {
    ...card,
    keywords: [...card.keywords],
    landLimits: [...card.landLimits],
    itemLimits: [...card.itemLimits]
  }
}

export function cloneHand(hand: MatchCard[]): MatchCard[] {
  return hand.map(cloneMatchCard)
}

export function canPlaceOnTerrain(card: MatchCard, terrain: Element): boolean {
  if (card.kind !== 'creature') return false
  return !card.landLimits.includes(terrain)
}

export function canInvadeWith(card: MatchCard): boolean {
  return card.kind === 'creature' && !card.keywords.includes('defensive')
}

export function canEquipItem(creature: MatchCard, item: MatchCard): boolean {
  if (item.kind === 'creature') {
    return item.keywords.includes('support') || item.keywords.includes('item_creature')
  }
  if (item.kind !== 'item') return false
  if (!item.itemCategory) return true
  return !creature.itemLimits.includes(item.itemCategory)
}

/** Stable starter books for Free Battle (50 cards each). */
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

export const BOOK_LIMITS = { creatures: 34, items: 8, spells: 8, total: 50 } as const

export type BookValidation = { ok: true } | { ok: false; message: string }

export function validateBookCatalogIds(catalogIds: string[]): BookValidation {
  if (catalogIds.length !== BOOK_LIMITS.total) {
    return { ok: false, message: `Book must have exactly ${BOOK_LIMITS.total} cards.` }
  }
  const cards = catalogIds.map((id) => listSagaCards().find((c) => c.id === id))
  if (cards.some((c) => !c)) {
    return { ok: false, message: 'Book contains unknown card ids.' }
  }
  const creatures = cards.filter((c) => c!.kind === 'creature').length
  const items = cards.filter((c) => c!.kind === 'item').length
  const spells = cards.filter((c) => c!.kind === 'spell').length
  if (creatures !== BOOK_LIMITS.creatures || items !== BOOK_LIMITS.items || spells !== BOOK_LIMITS.spells) {
    return {
      ok: false,
      message: `Need ${BOOK_LIMITS.creatures} creatures, ${BOOK_LIMITS.items} items, ${BOOK_LIMITS.spells} spells.`
    }
  }
  return { ok: true }
}

export function buildBookFromCatalogIds(catalogIds: string[]): MatchCard[] {
  const validation = validateBookCatalogIds(catalogIds)
  if (!validation.ok) throw new Error(validation.message)
  const byId = new Map(listSagaCards().map((c) => [c.id, c]))
  return catalogIds.map((id) => sagaCardToMatchCard(byId.get(id)!))
}

export function shuffleInPlace<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
