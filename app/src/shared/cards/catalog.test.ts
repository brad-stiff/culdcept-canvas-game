import { filterSagaCards, getSagaCardById, getSagaCatalog, listSagaCards } from './catalog'

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
  })

  it('filters by kind, element, and query', () => {
    const fires = filterSagaCards({ kind: 'creature', element: 'fire' })
    expect(fires.length).toBeGreaterThan(0)
    expect(fires.every((c) => c.element === 'fire')).toBe(true)

    const acid = filterSagaCards({ kind: 'spell', query: 'acid rain' })
    expect(acid.some((c) => c.id === 'acid-rain')).toBe(true)
  })
})
