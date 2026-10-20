import { BOOK_LIMITS, validateBookCatalogIds } from '../../../shared/game/matchCards'

export type SavedBook = {
  id: string
  name: string
  catalogIds: string[]
  updatedAt: string
}

const storageKey = (accountId: string) => `culdcept_books_${accountId}`

export function listSavedBooks(accountId: string): SavedBook[] {
  try {
    const raw = localStorage.getItem(storageKey(accountId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is SavedBook =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as SavedBook).id === 'string' &&
        typeof (b as SavedBook).name === 'string' &&
        Array.isArray((b as SavedBook).catalogIds)
    )
  } catch {
    return []
  }
}

export function saveBook(
  accountId: string,
  book: Omit<SavedBook, 'updatedAt'> & { updatedAt?: string }
): SavedBook {
  const validation = validateBookCatalogIds(book.catalogIds)
  if (!validation.ok) throw new Error(validation.message)
  const books = listSavedBooks(accountId)
  const next: SavedBook = {
    id: book.id,
    name: book.name.trim() || 'Untitled book',
    catalogIds: [...book.catalogIds],
    updatedAt: book.updatedAt ?? new Date().toISOString()
  }
  const idx = books.findIndex((b) => b.id === next.id)
  if (idx >= 0) books[idx] = next
  else books.push(next)
  localStorage.setItem(storageKey(accountId), JSON.stringify(books))
  return next
}

export function deleteBook(accountId: string, bookId: string): void {
  const books = listSavedBooks(accountId).filter((b) => b.id !== bookId)
  localStorage.setItem(storageKey(accountId), JSON.stringify(books))
}

/** Resolve lobby bookId to catalog ids; null means use starter seed. */
export function resolveBookCatalogIds(accountId: string, bookId: string): string[] | null {
  if (!bookId || bookId === 'starter') return null
  const book = listSavedBooks(accountId).find((b) => b.id === bookId)
  return book ? [...book.catalogIds] : null
}

export { BOOK_LIMITS }
