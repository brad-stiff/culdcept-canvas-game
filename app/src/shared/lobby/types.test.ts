import { canStartFreeBattle, canStartLanHost, defaultLobbyConfig, filledSeats } from './types'

describe('free battle lobby', () => {
  it('defaults to local human + AI with two open seats', () => {
    const config = defaultLobbyConfig('Brad')
    expect(config.seats).toHaveLength(4)
    expect(config.mapId).toBe('colosseum-i')
    expect(config.seats[0]).toMatchObject({ kind: 'human', name: 'Brad', bookId: 'starter' })
    expect(config.seats[1].kind).toBe('ai')
    expect(canStartFreeBattle(config)).toBe(true)
    expect(filledSeats(config)).toHaveLength(2)
  })

  it('allows 2–4 filled seats', () => {
    const config = defaultLobbyConfig('Brad')
    config.seats[1].kind = 'open'
    expect(canStartFreeBattle(config)).toBe(false)

    config.seats[1].kind = 'human'
    config.seats[1].name = 'Wife'
    config.seats[2].kind = 'ai'
    config.seats[2].name = 'AI 3'
    expect(canStartFreeBattle(config)).toBe(true)
    expect(filledSeats(config)).toHaveLength(3)

    config.seats[3].kind = 'ai'
    config.seats[3].name = 'AI 4'
    expect(canStartFreeBattle(config)).toBe(true)
    expect(filledSeats(config)).toHaveLength(4)
  })

  it('requires LAN human seats to be claimed before host start', () => {
    const config = defaultLobbyConfig('Brad')
    config.seats[0].clientId = 'host'
    config.seats[1].kind = 'human'
    config.seats[1].name = 'Wife'
    config.seats[1].clientId = null
    expect(canStartLanHost(config, 'host')).toBe(false)
    config.seats[1].clientId = 'wife'
    expect(canStartLanHost(config, 'host')).toBe(true)
  })
})
