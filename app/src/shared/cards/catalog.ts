import ps2CatalogJson from './ps2Catalog.json'
import revoltCatalogJson from './revoltCatalog.json'
import sagaCatalogJson from './sagaCatalog.json'
import type { SagaCard, SagaCardElement, SagaCardKind, SagaCatalog } from './types'

function nameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\bthe\b/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function withoutNameOverlaps(catalog: SagaCatalog, taken: readonly SagaCard[]): SagaCatalog {
  const takenNames = new Set(taken.map((c) => nameKey(c.name)))
  const cards = catalog.cards.filter((c) => !takenNames.has(nameKey(c.name)))
  return {
    ...catalog,
    counts: {
      total: cards.length,
      creature: cards.filter((c) => c.kind === 'creature').length,
      item: cards.filter((c) => c.kind === 'item').length,
      spell: cards.filter((c) => c.kind === 'spell').length
    },
    cards
  }
}

const sagaCatalog = sagaCatalogJson as SagaCatalog
const revoltCatalog = withoutNameOverlaps(revoltCatalogJson as SagaCatalog, sagaCatalog.cards)
const ps2Catalog = withoutNameOverlaps(ps2CatalogJson as SagaCatalog, [
  ...sagaCatalog.cards,
  ...revoltCatalog.cards
])

export type CardSource = 'culdcept-saga' | 'culdcept-revolt' | 'culdcept-ps2'

export function getSagaCatalog(): SagaCatalog {
  return sagaCatalog
}

export function getRevoltCatalog(): SagaCatalog {
  return revoltCatalog
}

export function getPs2Catalog(): SagaCatalog {
  return ps2Catalog
}

export function listSagaCards(): readonly SagaCard[] {
  return sagaCatalog.cards
}

export function listRevoltCards(): readonly SagaCard[] {
  return revoltCatalog.cards
}

export function listPs2Cards(): readonly SagaCard[] {
  return ps2Catalog.cards
}

export function listAllCards(): readonly SagaCard[] {
  return [...sagaCatalog.cards, ...revoltCatalog.cards, ...ps2Catalog.cards]
}

export function getSagaCardById(id: string): SagaCard | undefined {
  return sagaCatalog.cards.find((c) => c.id === id)
}

export function getCardById(id: string): SagaCard | undefined {
  return (
    getSagaCardById(id) ??
    revoltCatalog.cards.find((c) => c.id === id) ??
    ps2Catalog.cards.find((c) => c.id === id)
  )
}

export type SagaCardFilter = {
  kind?: SagaCardKind | 'all'
  element?: SagaCardElement | 'all'
  query?: string
  source?: CardSource | 'all'
}

export function filterCards(filter: SagaCardFilter = {}): SagaCard[] {
  const kind = filter.kind ?? 'all'
  const element = filter.element ?? 'all'
  const source = filter.source ?? 'all'
  const q = (filter.query ?? '').trim().toLowerCase()

  return listAllCards().filter((card) => {
    if (source !== 'all' && card.source !== source) return false
    if (kind !== 'all' && card.kind !== kind) return false
    if (element !== 'all' && card.element !== element) return false
    if (!q) return true
    return (
      card.name.toLowerCase().includes(q) ||
      card.abilityText.toLowerCase().includes(q) ||
      card.id.includes(q)
    )
  })
}

/** Saga-only filter (library/deck default). */
export function filterSagaCards(filter: SagaCardFilter = {}): SagaCard[] {
  return filterCards({ ...filter, source: filter.source ?? 'culdcept-saga' })
}
