import {
  filterCards,
  filterSagaCards,
  getCardById,
  getPs2Catalog,
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

  it('tags Water / Earth / Air at the unlabeled section breaks', () => {
    expect(getSagaCardById('yeti')?.element).toBe('water')
    expect(getSagaCardById('angostura')?.element).toBe('earth')
    expect(getSagaCardById('woodfolk')?.element).toBe('earth')
    expect(getSagaCardById('assassin')?.element).toBe('air')
    expect(getSagaCardById('griffon')?.element).toBe('air')
    expect(getSagaCardById('armed-princess')?.element).toBe('air')
    const creatures = listSagaCards().filter((c) => c.kind === 'creature')
    const byEl = Object.fromEntries(
      ['neutral', 'fire', 'water', 'earth', 'air', 'dual'].map((el) => [
        el,
        creatures.filter((c) => c.element === el).length
      ])
    )
    expect(byEl.air).toBeGreaterThan(30)
    expect(byEl.earth).toBeGreaterThan(30)
    expect(byEl.water).toBeGreaterThan(30)
    expect(byEl.fire).toBeGreaterThan(20)
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
  it('loads prefixed Revolt extras without colliding with Saga ids or names', () => {
    const catalog = getRevoltCatalog()
    const sagaNames = new Set(getSagaCatalog().cards.map((c) => c.name.trim().toLowerCase()))
    expect(catalog.game).toBe('culdcept-revolt')
    expect(catalog.counts.total).toBeGreaterThan(0)
    expect(catalog.counts.total).toBe(catalog.cards.length)
    expect(catalog.cards.every((c) => c.id.startsWith('revolt-'))).toBe(true)
    expect(catalog.cards.every((c) => c.source === 'culdcept-revolt')).toBe(true)
    expect(catalog.cards.every((c) => !sagaNames.has(c.name.trim().toLowerCase()))).toBe(true)

    expect(getCardById('revolt-goblin')).toBeUndefined()
    expect(getSagaCardById('goblin')?.source).toBe('culdcept-saga')
    expect(getCardById('goblin')?.source).toBe('culdcept-saga')

    const extra = catalog.cards.find((c) => c.kind === 'creature')
    expect(extra).toBeDefined()
    expect(getCardById(extra!.id)?.source).toBe('culdcept-revolt')
  })

  it('filters All vs Saga vs Revolt extras', () => {
    const allGoblins = filterCards({ query: 'goblin', source: 'all' })
    expect(allGoblins.some((c) => c.id === 'goblin')).toBe(true)
    expect(allGoblins.every((c) => c.id !== 'revolt-goblin')).toBe(true)
    expect(listAllCards().length).toBe(
      getSagaCatalog().counts.total + getRevoltCatalog().counts.total + getPs2Catalog().counts.total
    )

    const extras = filterCards({ source: 'culdcept-revolt' })
    expect(extras.length).toBe(getRevoltCatalog().counts.total)
    expect(extras.every((c) => c.source === 'culdcept-revolt')).toBe(true)
  })
})

describe('ps2 catalog', () => {
  it('loads prefixed PS2 extras without colliding with Saga or Revolt names', () => {
    const catalog = getPs2Catalog()
    const taken = new Set(
      [...getSagaCatalog().cards, ...getRevoltCatalog().cards].map((c) =>
        c.name.trim().toLowerCase()
      )
    )
    expect(catalog.game).toBe('culdcept-ps2')
    expect(catalog.counts.total).toBeGreaterThan(100)
    expect(catalog.counts.total).toBe(catalog.cards.length)
    expect(catalog.cards.every((c) => c.id.startsWith('ps2-'))).toBe(true)
    expect(catalog.cards.every((c) => c.source === 'culdcept-ps2')).toBe(true)
    expect(catalog.cards.every((c) => !taken.has(c.name.trim().toLowerCase()))).toBe(true)

    const mosquito = getCardById('ps2-amber-mosquito')
    expect(mosquito).toMatchObject({
      name: 'Amber Mosquito',
      kind: 'creature',
      element: 'neutral',
      source: 'culdcept-ps2'
    })
  })

  it('filters the PS2 extras source', () => {
    const extras = filterCards({ source: 'culdcept-ps2' })
    expect(extras.length).toBe(getPs2Catalog().counts.total)
    expect(extras.every((c) => c.source === 'culdcept-ps2')).toBe(true)
  })
})
