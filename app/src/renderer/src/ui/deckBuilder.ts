import { filterCards, getCardById } from '../../../shared/cards/catalog'
import type { SagaCard, SagaCardKind } from '../../../shared/cards/types'
import { BOOK_LIMITS, validateBookCatalogIds } from '../../../shared/game/matchCards'
import { deleteBook, listSavedBooks, saveBook, type SavedBook } from './books'

export type DeckBuilderController = {
  show: (accountId: string) => void
  hide: () => void
}

function counts(ids: string[]): { creatures: number; items: number; spells: number } {
  const cards = ids.map((id) => getCardById(id)).filter((c): c is SagaCard => Boolean(c))
  return {
    creatures: cards.filter((c) => c.kind === 'creature').length,
    items: cards.filter((c) => c.kind === 'item').length,
    spells: cards.filter((c) => c.kind === 'spell').length
  }
}

function kindLimit(kind: SagaCardKind): number {
  if (kind === 'creature') return BOOK_LIMITS.creatures
  if (kind === 'item') return BOOK_LIMITS.items
  return BOOK_LIMITS.spells
}

export function createDeckBuilderController(opts: {
  root: HTMLElement
  catalogEl: HTMLElement
  bookEl: HTMLElement
  statusEl: HTMLParagraphElement
  nameInput: HTMLInputElement
  savedSelect: HTMLSelectElement
  searchInput: HTMLInputElement
  kindSelect: HTMLSelectElement
  includeRevolt: HTMLInputElement
  btnSave: HTMLButtonElement
  btnNew: HTMLButtonElement
  btnDelete: HTMLButtonElement
  backBtn: HTMLButtonElement
  onBack: () => void
}): DeckBuilderController {
  let accountId = ''
  let editingId: string = crypto.randomUUID()
  let selectedIds: string[] = []

  function refreshSavedSelect(): void {
    const books = listSavedBooks(accountId)
    opts.savedSelect.innerHTML = ''
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = books.length ? '— Load saved —' : 'No saved books'
    opts.savedSelect.appendChild(placeholder)
    for (const b of books) {
      const opt = document.createElement('option')
      opt.value = b.id
      opt.textContent = b.name
      opts.savedSelect.appendChild(opt)
    }
  }

  function setStatus(text: string, isError = false): void {
    opts.statusEl.textContent = text
    opts.statusEl.classList.toggle('is-error', isError)
  }

  function renderBook(): void {
    const c = counts(selectedIds)
    opts.bookEl.innerHTML = ''
    const summary = document.createElement('p')
    summary.className = 'menu-hint'
    summary.textContent = `${selectedIds.length}/${BOOK_LIMITS.total} · C ${c.creatures}/${BOOK_LIMITS.creatures} · I ${c.items}/${BOOK_LIMITS.items} · S ${c.spells}/${BOOK_LIMITS.spells}`
    opts.bookEl.appendChild(summary)

    const list = document.createElement('ul')
    list.className = 'deck-book-list'
    for (const id of selectedIds) {
      const card = getCardById(id)
      if (!card) continue
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = `${card.name} (${card.kind})`
      btn.addEventListener('click', () => {
        const idx = selectedIds.indexOf(id)
        if (idx >= 0) selectedIds.splice(idx, 1)
        renderAll()
      })
      li.appendChild(btn)
      list.appendChild(li)
    }
    opts.bookEl.appendChild(list)
  }

  function renderCatalog(): void {
    const kind = opts.kindSelect.value as SagaCardKind | 'all'
    const query = opts.searchInput.value
    const source = opts.includeRevolt.checked ? 'all' : 'culdcept-saga'
    const cards = filterCards({ kind, element: 'all', query, source })
    opts.catalogEl.innerHTML = ''
    const list = document.createElement('ul')
    list.className = 'deck-catalog-list'
    for (const card of cards) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      const inBook = selectedIds.filter((id) => id === card.id).length
      btn.innerHTML = `${escapeHtml(card.name)}<span>${card.kind}${inBook ? ` · ×${inBook}` : ''}</span>`
      btn.addEventListener('click', () => {
        const c = counts(selectedIds)
        const limit = kindLimit(card.kind)
        const current =
          card.kind === 'creature' ? c.creatures : card.kind === 'item' ? c.items : c.spells
        if (selectedIds.length >= BOOK_LIMITS.total) {
          setStatus('Book is full (50 cards).', true)
          return
        }
        if (current >= limit) {
          setStatus(`Already have ${limit} ${card.kind}s.`, true)
          return
        }
        selectedIds.push(card.id)
        setStatus(`Added ${card.name}.`, false)
        renderAll()
      })
      li.appendChild(btn)
      list.appendChild(li)
    }
    opts.catalogEl.appendChild(list)
  }

  function renderAll(): void {
    renderCatalog()
    renderBook()
  }

  function loadBook(book: SavedBook): void {
    editingId = book.id
    selectedIds = [...book.catalogIds]
    opts.nameInput.value = book.name
    opts.savedSelect.value = book.id
    opts.includeRevolt.checked = book.catalogIds.some(
      (id) => id.startsWith('revolt-') || id.startsWith('ps2-')
    )
    setStatus(`Loaded “${book.name}”.`, false)
    renderAll()
  }

  function newBook(): void {
    editingId = crypto.randomUUID()
    selectedIds = []
    opts.nameInput.value = 'My Book'
    opts.savedSelect.value = ''
    opts.includeRevolt.checked = false
    setStatus('New book — pick 34 creatures, 8 items, 8 spells.', false)
    renderAll()
  }

  opts.backBtn.addEventListener('click', () => opts.onBack())
  opts.searchInput.addEventListener('input', () => renderCatalog())
  opts.kindSelect.addEventListener('change', () => renderCatalog())
  opts.includeRevolt.addEventListener('change', () => renderCatalog())
  opts.savedSelect.addEventListener('change', () => {
    const id = opts.savedSelect.value
    if (!id) return
    const book = listSavedBooks(accountId).find((b) => b.id === id)
    if (book) loadBook(book)
  })
  opts.btnNew.addEventListener('click', () => newBook())
  opts.btnDelete.addEventListener('click', () => {
    if (!opts.savedSelect.value) {
      setStatus('Select a saved book to delete.', true)
      return
    }
    deleteBook(accountId, opts.savedSelect.value)
    refreshSavedSelect()
    newBook()
    setStatus('Book deleted.', false)
  })
  opts.btnSave.addEventListener('click', () => {
    const validation = validateBookCatalogIds(selectedIds)
    if (!validation.ok) {
      setStatus(validation.message, true)
      return
    }
    try {
      const saved = saveBook(accountId, {
        id: editingId,
        name: opts.nameInput.value.trim() || 'My Book',
        catalogIds: selectedIds
      })
      editingId = saved.id
      refreshSavedSelect()
      opts.savedSelect.value = saved.id
      setStatus(`Saved “${saved.name}”.`, false)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed', true)
    }
  })

  return {
    show(id: string) {
      accountId = id
      opts.root.hidden = false
      refreshSavedSelect()
      newBook()
    },
    hide() {
      opts.root.hidden = true
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
