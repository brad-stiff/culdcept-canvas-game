import sagaCatalogJson from './sagaCatalog.json'
import type { SagaCard, SagaCardElement, SagaCardKind, SagaCatalog } from './types'

const catalog = sagaCatalogJson as SagaCatalog

export function getSagaCatalog(): SagaCatalog {
  return catalog
}

export function listSagaCards(): readonly SagaCard[] {
  return catalog.cards
}

export function getSagaCardById(id: string): SagaCard | undefined {
  return catalog.cards.find((c) => c.id === id)
}

export type SagaCardFilter = {
  kind?: SagaCardKind | 'all'
  element?: SagaCardElement | 'all'
  query?: string
}

export function filterSagaCards(filter: SagaCardFilter = {}): SagaCard[] {
  const kind = filter.kind ?? 'all'
  const element = filter.element ?? 'all'
  const q = (filter.query ?? '').trim().toLowerCase()

  return catalog.cards.filter((card) => {
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
