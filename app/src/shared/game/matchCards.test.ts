import { canInvadeWith, canPlaceOnTerrain, parseKeywords } from './matchCards'

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
