import { listSagaCards } from '../cards/catalog'
import {
  buildBookFromCatalogIds,
  buildStarterBook,
  canInvadeWith,
  canPlaceOnTerrain,
  parseKeywords,
  validateBookCatalogIds
} from './matchCards'

describe('parseKeywords 3A', () => {
  it('parses defensive, scroll, regen, instant death', () => {
    const parsed = parseKeywords(
      'Defensive / Scroll Attack / Regenerates / Instant Death / Attacks First'
    )
    expect(parsed.keywords).toEqual(
      expect.arrayContaining([
        'defensive',
        'scroll_attack',
        'regenerates',
        'instant_death',
        'attacks_first'
      ])
    )
  })

  it('parses land and item limits', () => {
    const parsed = parseKeywords('Land Limit: Fire, Water / Item Limit: Weapon, Scroll')
    expect(parsed.landLimits).toEqual(expect.arrayContaining(['fire', 'water']))
    expect(parsed.itemLimits).toEqual(expect.arrayContaining(['weapon', 'scroll']))
  })

  it('parses territory, secret art, and global', () => {
    const parsed = parseKeywords('Defensive / Global Ability: extra draw. Territory Ability / Secret Art')
    expect(parsed.keywords).toEqual(
      expect.arrayContaining(['global', 'territory_ability', 'secret_art', 'defensive'])
    )
  })

  it('parses neutralizes categories', () => {
    const parsed = parseKeywords('Neutralizes: Weapon / Armor')
    expect(parsed.keywords).toEqual(
      expect.arrayContaining(['neutralizes_weapon', 'neutralizes_armor'])
    )
  })
})

describe('placement and invasion gates', () => {
  it('blocks land-limited placement and defensive invasion', () => {
    const limited = {
      kind: 'creature' as const,
      landLimits: ['fire' as const],
      keywords: [] as const,
      itemLimits: []
    }
    expect(canPlaceOnTerrain(limited as never, 'fire')).toBe(false)
    expect(canPlaceOnTerrain(limited as never, 'water')).toBe(true)

    const defensive = {
      kind: 'creature' as const,
      keywords: ['defensive' as const],
      landLimits: [],
      itemLimits: []
    }
    expect(canInvadeWith(defensive as never)).toBe(false)
  })
})

describe('books', () => {
  it('keeps starter books on Saga ids only', () => {
    const book = buildStarterBook(0)
    expect(book).toHaveLength(50)
    expect(book.every((c) => !c.catalogId.startsWith('revolt-'))).toBe(true)
  })

  it('validates an expanded mix that includes a Revolt creature', () => {
    const saga = listSagaCards()
    const creatures = saga.filter((c) => c.kind === 'creature').slice(0, 33)
    const items = saga.filter((c) => c.kind === 'item').slice(0, 8)
    const spells = saga.filter((c) => c.kind === 'spell').slice(0, 8)
    const ids = [...creatures, ...items, ...spells].map((c) => c.id).concat('revolt-goblin')
    expect(ids).toHaveLength(50)
    expect(validateBookCatalogIds(ids)).toEqual({ ok: true })
    const built = buildBookFromCatalogIds(ids)
    expect(built.some((c) => c.catalogId === 'revolt-goblin')).toBe(true)
  })
})
