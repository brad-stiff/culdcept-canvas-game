import {
  canStartFreeBattle,
  defaultLobbyConfig,
  filledSeats,
  type FreeBattleLobbyConfig,
  type SeatKind
} from '../../../shared/lobby/types'

export type LobbyController = {
  show: (localPlayerName: string) => void
  hide: () => void
  getConfig: () => FreeBattleLobbyConfig
}

export function createLobbyController(opts: {
  root: HTMLElement
  seatsEl: HTMLElement
  hintEl: HTMLParagraphElement
  startBtn: HTMLButtonElement
  backBtn: HTMLButtonElement
  onBack: () => void
  onStart: (config: FreeBattleLobbyConfig) => void
}): LobbyController {
  let config = defaultLobbyConfig('Player')

  function setHint(text: string, isError: boolean): void {
    opts.hintEl.textContent = text
    opts.hintEl.classList.toggle('is-error', isError)
  }

  function syncStartEnabled(): void {
    const ok = canStartFreeBattle(config)
    opts.startBtn.disabled = !ok
    if (!ok) {
      setHint('Fill exactly two seats (Human or AI). Extra seats stay Open.', false)
    } else {
      const names = filledSeats(config)
        .map((s) => s.name)
        .join(' vs ')
      setHint(`Ready: ${names}`, false)
    }
  }

  function renderSeats(): void {
    opts.seatsEl.innerHTML = ''
    for (const seat of config.seats) {
      const row = document.createElement('div')
      row.className = 'lobby-seat'
      row.setAttribute('role', 'listitem')

      const label = document.createElement('div')
      label.className = 'lobby-seat-label'
      label.textContent = `Seat ${seat.index + 1}`

      const kindSelect = document.createElement('select')
      kindSelect.setAttribute('aria-label', `Seat ${seat.index + 1} type`)
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
      nameInput.placeholder = seat.kind === 'ai' ? 'AI name' : 'Player name'
      nameInput.value = seat.name
      nameInput.disabled = seat.kind === 'open'
      nameInput.setAttribute('aria-label', `Seat ${seat.index + 1} name`)

      kindSelect.addEventListener('change', () => {
        const kind = kindSelect.value as SeatKind
        seat.kind = kind
        if (kind === 'open') {
          seat.name = ''
          nameInput.value = ''
          nameInput.disabled = true
        } else if (kind === 'ai') {
          nameInput.disabled = false
          if (!seat.name) {
            seat.name = `AI ${seat.index + 1}`
            nameInput.value = seat.name
          }
        } else {
          nameInput.disabled = false
          if (!seat.name) {
            seat.name = 'Player'
            nameInput.value = seat.name
          }
        }
        syncStartEnabled()
      })

      nameInput.addEventListener('input', () => {
        seat.name = nameInput.value.trim() || (seat.kind === 'ai' ? `AI ${seat.index + 1}` : 'Player')
        syncStartEnabled()
      })

      row.append(label, kindSelect, nameInput)
      opts.seatsEl.appendChild(row)
    }
    syncStartEnabled()
  }

  opts.backBtn.addEventListener('click', () => opts.onBack())
  opts.startBtn.addEventListener('click', () => {
    if (!canStartFreeBattle(config)) {
      setHint('Need exactly two filled seats to start.', true)
      return
    }
    for (const seat of filledSeats(config)) {
      if (!seat.name.trim()) {
        setHint('Every filled seat needs a name.', true)
        return
      }
    }
    opts.onStart(config)
  })

  return {
    show(localPlayerName: string) {
      config = defaultLobbyConfig(localPlayerName)
      opts.root.hidden = false
      renderSeats()
    },
    hide() {
      opts.root.hidden = true
    },
    getConfig: () => config
  }
}
