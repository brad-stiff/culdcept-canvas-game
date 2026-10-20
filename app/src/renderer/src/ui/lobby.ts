import { listMaps } from '../../../shared/game/maps'
import { LAN_DEFAULT_PORT } from '../../../shared/lan/protocol'
import {
  canStartFreeBattle,
  canStartLanHost,
  defaultLobbyConfig,
  filledSeats,
  type FreeBattleLobbyConfig,
  type PlayMode,
  type SeatKind
} from '../../../shared/lobby/types'
import { listSavedBooks } from './books'

export type LobbyController = {
  show: (localPlayerName: string) => void
  hide: () => void
  getConfig: () => FreeBattleLobbyConfig
  getMode: () => PlayMode
  setStatus: (text: string, isError?: boolean) => void
  setLanInfo: (text: string) => void
  applyRemoteLobby: (lobby: FreeBattleLobbyConfig) => void
  getClientId: () => string
}

function ensureClientId(): string {
  const key = 'culdcept_lan_client_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function createLobbyController(opts: {
  root: HTMLElement
  seatsEl: HTMLElement
  mapRowEl: HTMLElement
  hintEl: HTMLParagraphElement
  startBtn: HTMLButtonElement
  backBtn: HTMLButtonElement
  modeRowEl: HTMLElement
  lanPanelEl: HTMLElement
  getAccountId: () => string
  onBack: () => void
  onStartLocal: (config: FreeBattleLobbyConfig) => void
  onHostReady: (config: FreeBattleLobbyConfig, clientId: string) => Promise<void>
  onHostStartMatch: (config: FreeBattleLobbyConfig, clientId: string) => void
  onJoin: (host: string, port: number, name: string, clientId: string) => Promise<void>
  onStopLan: () => void
}): LobbyController {
  let config = defaultLobbyConfig('Player')
  let mode: PlayMode = 'local'
  let localPlayerName = 'Player'
  const clientId = ensureClientId()
  let hosting = false

  const joinHostInput = document.createElement('input')
  joinHostInput.type = 'text'
  joinHostInput.placeholder = 'Host IP'
  joinHostInput.id = 'lan-join-host'
  const joinPortInput = document.createElement('input')
  joinPortInput.type = 'number'
  joinPortInput.value = String(LAN_DEFAULT_PORT)
  joinPortInput.id = 'lan-join-port'
  const joinBtn = document.createElement('button')
  joinBtn.type = 'button'
  joinBtn.textContent = 'Connect'
  const lanInfo = document.createElement('p')
  lanInfo.className = 'menu-hint'
  lanInfo.id = 'lan-info'

  function setHint(text: string, isError: boolean): void {
    opts.hintEl.textContent = text
    opts.hintEl.classList.toggle('is-error', isError)
  }

  function syncStartEnabled(): void {
    if (mode === 'join') {
      opts.startBtn.disabled = true
      opts.startBtn.textContent = 'Waiting for host…'
      return
    }
    if (mode === 'host') {
      const ok = canStartLanHost(config, clientId)
      opts.startBtn.disabled = !ok || !hosting
      opts.startBtn.textContent = 'Start match'
      if (!hosting) setHint('Click “Open LAN” first, then wait for players.', false)
      else if (!ok) setHint('Need 2–4 filled seats; each Human seat must be claimed.', false)
      else setHint(`Ready — ${filledSeats(config).length} cepters.`, false)
      return
    }
    const ok = canStartFreeBattle(config)
    opts.startBtn.disabled = !ok
    opts.startBtn.textContent = 'Start match'
    if (!ok) setHint('Fill 2–4 seats (Human or AI).', false)
    else setHint(`Ready: ${filledSeats(config).map((s) => s.name).join(', ')}`, false)
  }

  function renderModes(): void {
    opts.modeRowEl.innerHTML = ''
    for (const [id, label] of [
      ['local', 'Local / hotseat'],
      ['host', 'Host LAN'],
      ['join', 'Join LAN']
    ] as const) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = mode === id ? 'btn-mode is-active' : 'btn-mode'
      btn.textContent = label
      btn.addEventListener('click', () => {
        if (mode !== id) {
          opts.onStopLan()
          hosting = false
        }
        mode = id
        renderModes()
        renderLanPanel()
        renderSeats()
      })
      opts.modeRowEl.appendChild(btn)
    }
  }

  function renderLanPanel(): void {
    opts.lanPanelEl.innerHTML = ''
    opts.lanPanelEl.hidden = mode === 'local'
    if (mode === 'host') {
      const openBtn = document.createElement('button')
      openBtn.type = 'button'
      openBtn.textContent = hosting ? 'LAN open' : 'Open LAN'
      openBtn.disabled = hosting
      openBtn.addEventListener('click', async () => {
        try {
          await opts.onHostReady(config, clientId)
          hosting = true
          renderLanPanel()
          syncStartEnabled()
        } catch (err) {
          setHint(err instanceof Error ? err.message : 'Failed to host', true)
        }
      })
      opts.lanPanelEl.append(openBtn, lanInfo)
    }
    if (mode === 'join') {
      const row = document.createElement('div')
      row.className = 'menu-row'
      row.append(joinHostInput, joinPortInput, joinBtn)
      joinBtn.onclick = async () => {
        const host = joinHostInput.value.trim()
        const port = Number(joinPortInput.value) || LAN_DEFAULT_PORT
        if (!host) {
          setHint('Enter host IP.', true)
          return
        }
        try {
          await opts.onJoin(host, port, localPlayerName, clientId)
          setHint(`Connected to ${host}:${port}`, false)
        } catch (err) {
          setHint(err instanceof Error ? err.message : 'Join failed', true)
        }
      }
      opts.lanPanelEl.append(row, lanInfo)
    }
  }

  function bookOptions(): { id: string; label: string }[] {
    const books = listSavedBooks(opts.getAccountId())
    return [{ id: 'starter', label: 'Starter' }, ...books.map((b) => ({ id: b.id, label: b.name }))]
  }

  function renderMapRow(): void {
    opts.mapRowEl.innerHTML = ''
    const locked = mode === 'join'
    const label = document.createElement('label')
    label.textContent = 'Map'
    label.htmlFor = 'lobby-map-select'
    const select = document.createElement('select')
    select.id = 'lobby-map-select'
    select.disabled = locked
    for (const map of listMaps()) {
      const opt = document.createElement('option')
      opt.value = map.mapId
      opt.textContent = `${map.mapName} (${map.boardSize} tiles · ${map.targetMagic}G)`
      select.appendChild(opt)
    }
    select.value = config.mapId
    select.addEventListener('change', () => {
      config.mapId = select.value
      if (mode === 'host' && hosting) void opts.onHostReady(config, clientId)
    })
    opts.mapRowEl.append(label, select)
  }

  function renderSeats(): void {
    opts.seatsEl.innerHTML = ''
    const locked = mode === 'join'
    const books = bookOptions()
    for (const seat of config.seats) {
      if (!seat.bookId) seat.bookId = 'starter'
      const row = document.createElement('div')
      row.className = 'lobby-seat'
      row.setAttribute('role', 'listitem')

      const label = document.createElement('div')
      label.className = 'lobby-seat-label'
      const claim =
        seat.kind === 'human' && seat.clientId
          ? seat.clientId === clientId
            ? ' (you)'
            : ' (remote)'
          : ''
      label.textContent = `Seat ${seat.index + 1}${claim}`

      const kindSelect = document.createElement('select')
      kindSelect.disabled = locked
      for (const [value, text] of [
        ['human', 'Human'],
        ['ai', 'AI'],
        ['open', 'Open']
      ] as const) {
        const opt = document.createElement('option')
        opt.value = value
        opt.textContent = text
        kindSelect.appendChild(opt)
      }
      kindSelect.value = seat.kind

      const nameInput = document.createElement('input')
      nameInput.type = 'text'
      nameInput.maxLength = 24
      nameInput.value = seat.name
      nameInput.disabled = locked || seat.kind === 'open'

      const bookSelect = document.createElement('select')
      bookSelect.disabled = locked || seat.kind === 'open'
      bookSelect.setAttribute('aria-label', `Book for seat ${seat.index + 1}`)
      for (const b of books) {
        const opt = document.createElement('option')
        opt.value = b.id
        opt.textContent = b.label
        bookSelect.appendChild(opt)
      }
      if (!books.some((b) => b.id === seat.bookId)) seat.bookId = 'starter'
      bookSelect.value = seat.bookId

      kindSelect.addEventListener('change', () => {
        const kind = kindSelect.value as SeatKind
        seat.kind = kind
        seat.clientId = kind === 'human' && seat.index === 0 ? clientId : null
        if (kind === 'open') {
          seat.name = ''
          nameInput.value = ''
          nameInput.disabled = true
          bookSelect.disabled = true
        } else if (kind === 'ai') {
          nameInput.disabled = false
          bookSelect.disabled = false
          if (!seat.name) {
            seat.name = `AI ${seat.index + 1}`
            nameInput.value = seat.name
          }
          seat.clientId = null
        } else {
          nameInput.disabled = false
          bookSelect.disabled = false
          if (!seat.name) {
            seat.name = seat.index === 0 ? localPlayerName : `Player ${seat.index + 1}`
            nameInput.value = seat.name
          }
          if (seat.index === 0) seat.clientId = clientId
        }
        syncStartEnabled()
        if (mode === 'host' && hosting) {
          void opts.onHostReady(config, clientId)
        }
      })

      nameInput.addEventListener('input', () => {
        seat.name =
          nameInput.value.trim() ||
          (seat.kind === 'ai' ? `AI ${seat.index + 1}` : `Player ${seat.index + 1}`)
        syncStartEnabled()
      })

      bookSelect.addEventListener('change', () => {
        seat.bookId = bookSelect.value
        if (mode === 'host' && hosting) void opts.onHostReady(config, clientId)
      })

      row.append(label, kindSelect, nameInput, bookSelect)
      opts.seatsEl.appendChild(row)
    }
    syncStartEnabled()
  }

  opts.backBtn.addEventListener('click', () => {
    opts.onStopLan()
    hosting = false
    opts.onBack()
  })

  opts.startBtn.addEventListener('click', () => {
    if (mode === 'local') {
      if (!canStartFreeBattle(config)) {
        setHint('Need 2–4 filled named seats.', true)
        return
      }
      opts.onStartLocal(config)
      return
    }
    if (mode === 'host') {
      if (!canStartLanHost(config, clientId)) {
        setHint('LAN seats not ready.', true)
        return
      }
      opts.onHostStartMatch(config, clientId)
    }
  })

  return {
    show(name: string) {
      localPlayerName = name
      config = defaultLobbyConfig(name)
      config.seats[0].clientId = clientId
      mode = 'local'
      hosting = false
      opts.root.hidden = false
      lanInfo.textContent = ''
      renderModes()
      renderLanPanel()
      renderMapRow()
      renderSeats()
    },
    hide() {
      opts.root.hidden = true
    },
    getConfig: () => config,
    getMode: () => mode,
    setStatus(text, isError = false) {
      setHint(text, isError)
    },
    setLanInfo(text: string) {
      lanInfo.textContent = text
    },
    applyRemoteLobby(lobby: FreeBattleLobbyConfig) {
      config = lobby
      if (!config.mapId) config.mapId = 'colosseum-i'
      renderMapRow()
      renderSeats()
    },
    getClientId: () => clientId
  }
}
