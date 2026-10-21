import {
  filterCards,
  filterSagaCards,
  getCardById,
  getRevoltCatalog,
  getSagaCardById,
  getSagaCatalog,
  listAllCards,
  listSagaCards
} from './catalog'

describe('saga catalog', () => {
  it('loads the generated Saga catalog with creatures, items, and spells', () => {
    const catalog = getSagaCatalog()
    expect(catalog.game).toBe('culdcept-saga')
    expect(catalog.counts.total).toBe(listSagaCards().length)
    expect(catalog.counts.creature).toBeGreaterThan(200)
    expect(catalog.counts.item).toBeGreaterThan(50)
    expect(catalog.counts.spell).toBeGreaterThan(100)
  })

  it('looks up Goblin by id', () => {
    const goblin = getSagaCardById('goblin')
    expect(goblin).toMatchObject({
      name: 'Goblin',
      kind: 'creature',
      element: 'neutral',
      st: 20,
      hp: 30
    })
    expect(goblin?.source).toBe('culdcept-saga')
  })

  it('filters by kind, element, and query', () => {
    const fires = filterSagaCards({ kind: 'creature', element: 'fire' })
    expect(fires.length).toBeGreaterThan(0)
    expect(fires.every((c) => c.element === 'fire')).toBe(true)

    const acid = filterSagaCards({ kind: 'spell', query: 'acid rain' })
    expect(acid.some((c) => c.id === 'acid-rain')).toBe(true)
  })
})

describe('revolt catalog', () => {
  it('loads prefixed Revolt cards without colliding with Saga ids', () => {
    const catalog = getRevoltCatalog()
    expect(catalog.game).toBe('culdcept-revolt')
    expect(catalog.counts.total).toBeGreaterThan(0)
    expect(catalog.cards.every((c) => c.id.startsWith('revolt-'))).toBe(true)
    expect(catalog.cards.every((c) => c.source === 'culdcept-revolt')).toBe(true)

    const revoltGoblin = getCardById('revolt-goblin')
    expect(revoltGoblin).toMatchObject({ name: 'Goblin', source: 'culdcept-revolt' })
    expect(getSagaCardById('goblin')?.source).toBe('culdcept-saga')
    expect(getCardById('goblin')?.source).toBe('culdcept-saga')
  })

  it('filters All vs Saga vs Revolt', () => {
    const allGoblins = filterCards({ query: 'goblin', source: 'all' })
    expect(allGoblins.some((c) => c.id === 'goblin')).toBe(true)
    expect(allGoblins.some((c) => c.id === 'revolt-goblin')).toBe(true)
    expect(listAllCards().length).toBe(getSagaCatalog().counts.total + getRevoltCatalog().counts.total)
  })
})
