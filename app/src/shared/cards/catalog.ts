import revoltCatalogJson from './revoltCatalog.json'
import sagaCatalogJson from './sagaCatalog.json'
import type { SagaCard, SagaCardElement, SagaCardKind, SagaCatalog } from './types'

const sagaCatalog = sagaCatalogJson as SagaCatalog
const revoltCatalog = revoltCatalogJson as SagaCatalog

export type CardSource = 'culdcept-saga' | 'culdcept-revolt'

export function getSagaCatalog(): SagaCatalog {
  return sagaCatalog
}

export function getRevoltCatalog(): SagaCatalog {
  return revoltCatalog
}

export function listSagaCards(): readonly SagaCard[] {
  return sagaCatalog.cards
}

export function listRevoltCards(): readonly SagaCard[] {
  return revoltCatalog.cards
}

export function listAllCards(): readonly SagaCard[] {
  return [...sagaCatalog.cards, ...revoltCatalog.cards]
}

export function getSagaCardById(id: string): SagaCard | undefined {
  return sagaCatalog.cards.find((c) => c.id === id)
}

export function getCardById(id: string): SagaCard | undefined {
  return getSagaCardById(id) ?? revoltCatalog.cards.find((c) => c.id === id)
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
