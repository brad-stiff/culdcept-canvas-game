import { canStartFreeBattle, defaultLobbyConfig, filledSeats } from './types'

describe('free battle lobby', () => {
  it('defaults to local human + AI with two open seats', () => {
    const config = defaultLobbyConfig('Brad')
    expect(config.seats).toHaveLength(4)
    expect(config.seats[0]).toMatchObject({ kind: 'human', name: 'Brad' })
    expect(config.seats[1].kind).toBe('ai')
    expect(canStartFreeBattle(config)).toBe(true)
    expect(filledSeats(config)).toHaveLength(2)
  })

  it('requires exactly two filled seats to start', () => {
    const config = defaultLobbyConfig('Brad')
    config.seats[1].kind = 'open'
    expect(canStartFreeBattle(config)).toBe(false)

    config.seats[1].kind = 'human'
    config.seats[1].name = 'Wife'
    config.seats[2].kind = 'ai'
    config.seats[2].name = 'AI 3'
    expect(canStartFreeBattle(config)).toBe(false)
  })
})
