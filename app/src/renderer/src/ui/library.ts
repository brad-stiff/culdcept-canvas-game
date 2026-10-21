import {
  filterCards,
  getRevoltCatalog,
  getSagaCatalog,
  type CardSource
} from '../../../shared/cards/catalog'
import type { SagaCard, SagaCardElement, SagaCardKind } from '../../../shared/cards/types'
import { parseKeywords } from '../../../shared/game/matchCards'
import { resolveCardArtUrl } from './cardArt'

export type LibraryController = {
  show: () => void
  hide: () => void
}

function formatCost(card: SagaCard): string {
  const plus = '+'.repeat(card.costPlus)
  return `${card.cost}${plus}G`
}

function formatStats(card: SagaCard): string {
  if (card.kind !== 'creature') return formatCost(card)
  return `ST ${card.st} / HP ${card.hp} / MHP ${card.mhp} · ${formatCost(card)}`
}

function sourceLabel(source: string): string {
  if (source === 'culdcept-revolt') return 'Revolt'
  return 'Saga'
}

export function createLibraryController(opts: {
  root: HTMLElement
  listEl: HTMLUListElement
  detailEl: HTMLElement
  countLine: HTMLParagraphElement
  searchInput: HTMLInputElement
  kindSelect: HTMLSelectElement
  elementSelect: HTMLSelectElement
  sourceSelect: HTMLSelectElement
  backBtn: HTMLButtonElement
  onBack: () => void
}): LibraryController {
  let selectedId: string | null = null
  let renderToken = 0

  async function renderDetail(card: SagaCard | null): Promise<void> {
    if (!card) {
      opts.detailEl.innerHTML = `<p class="menu-hint">Select a card to view details.</p>`
      return
    }

    const artUrl = await resolveCardArtUrl(card.id, card.name)
    const element =
      card.element != null ? card.element : card.kind === 'item' ? 'item' : 'spell'
    const parsed = parseKeywords(card.abilityText)
    const keywordHtml =
      parsed.keywords.length > 0
        ? `<div class="library-keywords">${parsed.keywords
            .map((k) => `<span>${escapeHtml(k)}</span>`)
            .join('')}</div>`
        : ''

    opts.detailEl.innerHTML = `
      <div class="library-detail-header">
        <img class="library-detail-art" alt="" src="${artUrl}" />
        <div>
          <h2>${escapeHtml(card.name)}</h2>
          <p class="stat-line">${escapeHtml(card.kind)} · ${escapeHtml(element)} · ${escapeHtml(
            sourceLabel(card.source)
          )}${card.special ? ' · special' : ''}</p>
          <p class="stat-line">${escapeHtml(formatStats(card))}</p>
          ${keywordHtml}
        </div>
      </div>
      <h3>Ability</h3>
      <p>${escapeHtml(card.abilityText || '—')}</p>
      <h3>Flavor</h3>
      <p>${escapeHtml(card.flavor || '—')}</p>
      <h3>Explanation</h3>
      <p>${escapeHtml(card.explanation || '—')}</p>
    `
  }

  function renderList(): void {
    const token = ++renderToken
    const kind = opts.kindSelect.value as SagaCardKind | 'all'
    const element = opts.elementSelect.value as SagaCardElement | 'all'
    const source = opts.sourceSelect.value as CardSource | 'all'
    const query = opts.searchInput.value
    const cards = filterCards({ kind, element, query, source })
    const total =
      source === 'culdcept-revolt'
        ? getRevoltCatalog().counts.total
        : source === 'all'
          ? getSagaCatalog().counts.total + getRevoltCatalog().counts.total
          : getSagaCatalog().counts.total
    const gameLabel =
      source === 'culdcept-revolt' ? 'Revolt' : source === 'all' ? 'Saga + Revolt' : 'Saga'

    opts.countLine.textContent = `${cards.length} of ${total} ${gameLabel} cards`
    opts.listEl.innerHTML = ''

    for (const card of cards) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.classList.toggle('is-selected', card.id === selectedId)
      btn.innerHTML = `${escapeHtml(card.name)}<span class="card-meta">${escapeHtml(
        card.kind
      )} · ${escapeHtml(formatStats(card))}</span>`
      btn.addEventListener('click', () => {
        selectedId = card.id
        void renderList()
        void renderDetail(card)
      })
      li.appendChild(btn)
      opts.listEl.appendChild(li)
    }

    if (token !== renderToken) return

    if (selectedId) {
      const selected = cards.find((c) => c.id === selectedId) ?? null
      if (!selected) {
        selectedId = null
        void renderDetail(null)
      }
    }
  }

  opts.backBtn.addEventListener('click', () => opts.onBack())
  opts.searchInput.addEventListener('input', () => renderList())
  opts.kindSelect.addEventListener('change', () => renderList())
  opts.elementSelect.addEventListener('change', () => renderList())
  opts.sourceSelect.addEventListener('change', () => renderList())

  return {
    show() {
      opts.root.hidden = false
      selectedId = null
      opts.searchInput.value = ''
      opts.kindSelect.value = 'all'
      opts.elementSelect.value = 'all'
      opts.sourceSelect.value = 'culdcept-saga'
      renderList()
      void renderDetail(null)
    },
    hide() {
      opts.root.hidden = true
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
