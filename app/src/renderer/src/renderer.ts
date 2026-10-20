import '../assets/shell.css'
import { backingSizeForCssBox } from '../../shared/canvasLayout'
import { filledSeats, type FreeBattleLobbyConfig } from '../../shared/lobby/types'
import { GameView } from './game/GameView'
import { createLibraryController } from './ui/library'
import { createLobbyController } from './ui/lobby'

const STORAGE_KEY = 'culdcept_canvas_accounts_v1'

type StoredAccount = {
  id: string
  name: string
  createdAt: string
}

const MAIN_ACTIONS: { id: string; title: string; subtitle: string }[] = [
  { id: 'story', title: 'Story', subtitle: 'Campaign (stub — out of v1 scope)' },
  { id: 'free', title: 'Free Battle', subtitle: 'Local lobby · LAN later' },
  { id: 'library', title: 'Card library', subtitle: 'Browse Saga catalog' },
  { id: 'deck', title: 'Deck builder', subtitle: 'Compose decks (stub)' },
  { id: 'card', title: 'Card builder', subtitle: 'Author cards (stub)' },
  { id: 'board', title: 'Board builder', subtitle: 'Maps & boards (stub)' },
  { id: 'avatar', title: 'Avatar builder', subtitle: 'Player look (stub)' }
]

let activeGame: GameView | null = null
let activeAccountName = 'Player'

function layoutCanvas(canvas: HTMLCanvasElement, shell: HTMLElement): void {
  const rect = shell.getBoundingClientRect()
  const cssWidth = rect.width
  const cssHeight = rect.height
  const dpr = window.devicePixelRatio || 1
  const backing = backingSizeForCssBox(cssWidth, cssHeight, dpr)

  canvas.style.width = `${backing.cssWidth}px`
  canvas.style.height = `${backing.cssHeight}px`
  canvas.width = backing.bufferWidth
  canvas.height = backing.bufferHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (activeGame) {
    activeGame.resize(cssWidth, cssHeight)
    return
  }

  drawIdleCanvas(ctx, cssWidth, cssHeight)
}

function drawIdleCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(232, 234, 237, 0.55)'
  ctx.font = `${Math.round(Math.min(w, h) * 0.035)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Choose Free Battle from the main menu', w / 2, h / 2)
  ctx.restore()
}

function startFreeBattle(
  canvas: HTMLCanvasElement,
  shell: HTMLElement,
  menuLayer: HTMLElement,
  hudStatus: HTMLDivElement,
  stubNote: HTMLParagraphElement,
  config: FreeBattleLobbyConfig,
  onEnd: () => void
): void {
  if (activeGame) {
    activeGame.destroy()
  }

  const seats = filledSeats(config)
  const names: [string, string] = [seats[0].name, seats[1].name]
  activeGame = new GameView(canvas, shell, names, onEnd)

  menuLayer.classList.add('menu-layer-dismissed')
  stubNote.textContent = ''
  const kinds = seats.map((s) => s.kind).join(' / ')
  hudStatus.textContent = `Free Battle — ${names[0]} vs ${names[1]} (${kinds})`
  layoutCanvas(canvas, shell)
}

function endFreeBattle(
  menuLayer: HTMLElement,
  hudStatus: HTMLDivElement,
  stubNote: HTMLParagraphElement
): void {
  if (activeGame) {
    activeGame.destroy()
    activeGame = null
  }
  menuLayer.classList.remove('menu-layer-dismissed')
  hudStatus.textContent = `HUD — ${activeAccountName}`
  stubNote.textContent = 'Free Battle ended.'
}

function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a): a is StoredAccount =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as StoredAccount).id === 'string' &&
        typeof (a as StoredAccount).name === 'string'
    )
  } catch {
    return []
  }
}

function writeAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function initMenu(): void {
  const screenAccount = document.getElementById('screen-account')
  const screenMain = document.getElementById('screen-main')
  const screenLobby = document.getElementById('screen-lobby')
  const screenLibrary = document.getElementById('screen-library')
  const newNameInput = document.getElementById('new-account-name')
  const btnCreate = document.getElementById('btn-create-account')
  const existingSelect = document.getElementById('existing-account')
  const btnExisting = document.getElementById('btn-use-existing')
  const accountHint = document.getElementById('account-hint')
  const mainUserLine = document.getElementById('main-user-line')
  const mainActions = document.getElementById('main-actions')
  const stubNote = document.getElementById('stub-note')
  const btnSignOut = document.getElementById('btn-sign-out')
  const hudStatus = document.getElementById('hud-status')
  const canvas = document.getElementById('game')
  const shell = document.getElementById('shell')
  const menuLayer = document.getElementById('menu-layer')
  const lobbySeats = document.getElementById('lobby-seats')
  const lobbyHint = document.getElementById('lobby-hint')
  const btnLobbyStart = document.getElementById('btn-lobby-start')
  const btnLobbyBack = document.getElementById('btn-lobby-back')
  const libraryList = document.getElementById('library-list')
  const libraryDetail = document.getElementById('library-detail')
  const libraryCountLine = document.getElementById('library-count-line')
  const librarySearch = document.getElementById('library-search')
  const libraryKind = document.getElementById('library-kind')
  const libraryElement = document.getElementById('library-element')
  const btnLibraryBack = document.getElementById('btn-library-back')

  if (
    !(screenAccount instanceof HTMLElement) ||
    !(screenMain instanceof HTMLElement) ||
    !(screenLobby instanceof HTMLElement) ||
    !(screenLibrary instanceof HTMLElement) ||
    !(newNameInput instanceof HTMLInputElement) ||
    !(btnCreate instanceof HTMLButtonElement) ||
    !(existingSelect instanceof HTMLSelectElement) ||
    !(btnExisting instanceof HTMLButtonElement) ||
    !(accountHint instanceof HTMLParagraphElement) ||
    !(mainUserLine instanceof HTMLParagraphElement) ||
    !(mainActions instanceof HTMLUListElement) ||
    !(stubNote instanceof HTMLParagraphElement) ||
    !(btnSignOut instanceof HTMLButtonElement) ||
    !(hudStatus instanceof HTMLDivElement) ||
    !(canvas instanceof HTMLCanvasElement) ||
    !(shell instanceof HTMLElement) ||
    !(menuLayer instanceof HTMLElement) ||
    !(lobbySeats instanceof HTMLElement) ||
    !(lobbyHint instanceof HTMLParagraphElement) ||
    !(btnLobbyStart instanceof HTMLButtonElement) ||
    !(btnLobbyBack instanceof HTMLButtonElement) ||
    !(libraryList instanceof HTMLUListElement) ||
    !(libraryDetail instanceof HTMLElement) ||
    !(libraryCountLine instanceof HTMLParagraphElement) ||
    !(librarySearch instanceof HTMLInputElement) ||
    !(libraryKind instanceof HTMLSelectElement) ||
    !(libraryElement instanceof HTMLSelectElement) ||
    !(btnLibraryBack instanceof HTMLButtonElement)
  ) {
    return
  }

  const menu = {
    screenAccount,
    screenMain,
    screenLobby,
    screenLibrary,
    newNameInput,
    btnCreate,
    existingSelect,
    btnExisting,
    accountHint,
    mainUserLine,
    mainActions,
    stubNote,
    btnSignOut,
    hudStatus,
    canvas,
    shell,
    menuLayer
  }

  let lobby!: ReturnType<typeof createLobbyController>
  let library!: ReturnType<typeof createLibraryController>

  function hideAllScreens(): void {
    menu.screenAccount.hidden = true
    menu.screenMain.hidden = true
    lobby.hide()
    library.hide()
  }

  function setHint(text: string, isError: boolean): void {
    menu.accountHint.textContent = text
    menu.accountHint.classList.toggle('is-error', isError)
  }

  function refreshAccountSelect(): void {
    const accounts = readAccounts()
    const current = menu.existingSelect.value
    menu.existingSelect.innerHTML = ''
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = accounts.length ? '— Select —' : 'No saved accounts yet'
    menu.existingSelect.appendChild(placeholder)
    for (const a of accounts) {
      const opt = document.createElement('option')
      opt.value = a.id
      opt.textContent = a.name
      menu.existingSelect.appendChild(opt)
    }
    if (accounts.some((a) => a.id === current)) {
      menu.existingSelect.value = current
    }
    menu.btnExisting.disabled = accounts.length === 0
  }

  function showAccount(): void {
    hideAllScreens()
    menu.screenAccount.hidden = false
    menu.newNameInput.value = ''
    setHint('', false)
    refreshAccountSelect()
    menu.stubNote.textContent = ''
    menu.hudStatus.textContent = 'HUD — not signed in'
  }

  function showMain(account: StoredAccount): void {
    hideAllScreens()
    menu.screenMain.hidden = false
    menu.mainUserLine.textContent = `Signed in as ${account.name}`
    menu.hudStatus.textContent = `HUD — ${account.name}`
    activeAccountName = account.name
  }

  lobby = createLobbyController({
    root: screenLobby,
    seatsEl: lobbySeats,
    hintEl: lobbyHint,
    startBtn: btnLobbyStart,
    backBtn: btnLobbyBack,
    onBack: () => {
      hideAllScreens()
      menu.screenMain.hidden = false
    },
    onStart: (config) => {
      hideAllScreens()
      startFreeBattle(
        menu.canvas,
        menu.shell,
        menu.menuLayer,
        menu.hudStatus,
        menu.stubNote,
        config,
        () => {
          endFreeBattle(menu.menuLayer, menu.hudStatus, menu.stubNote)
          hideAllScreens()
          menu.screenMain.hidden = false
        }
      )
    }
  })

  library = createLibraryController({
    root: screenLibrary,
    listEl: libraryList,
    detailEl: libraryDetail,
    countLine: libraryCountLine,
    searchInput: librarySearch,
    kindSelect: libraryKind,
    elementSelect: libraryElement,
    backBtn: btnLibraryBack,
    onBack: () => {
      hideAllScreens()
      menu.screenMain.hidden = false
    }
  })

  function buildMainActions(): void {
    menu.mainActions.innerHTML = ''
    for (const action of MAIN_ACTIONS) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.stubId = action.id
      btn.innerHTML = `${action.title}<span>${action.subtitle}</span>`
      btn.addEventListener('click', () => {
        if (action.id === 'free') {
          hideAllScreens()
          lobby.show(activeAccountName)
          return
        }
        if (action.id === 'library') {
          hideAllScreens()
          library.show()
          return
        }
        menu.stubNote.textContent = `${action.title}: stub — not implemented yet.`
      })
      li.appendChild(btn)
      menu.mainActions.appendChild(li)
    }
  }

  menu.btnCreate.addEventListener('click', () => {
    const name = normalizeName(menu.newNameInput.value)
    if (!name) {
      setHint('Enter a display name.', true)
      return
    }
    const accounts = readAccounts()
    const dup = accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())
    if (dup) {
      setHint('That name is already used. Pick another or choose it below.', true)
      return
    }
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString()
    }
    accounts.push(account)
    writeAccounts(accounts)
    refreshAccountSelect()
    setHint('Account created.', false)
    showMain(account)
  })

  menu.btnExisting.addEventListener('click', () => {
    const id = menu.existingSelect.value
    if (!id) {
      setHint('Select an account from the list.', true)
      return
    }
    const account = readAccounts().find((a) => a.id === id)
    if (!account) {
      setHint('That account no longer exists. Refreshing list.', true)
      refreshAccountSelect()
      return
    }
    setHint('', false)
    showMain(account)
  })

  menu.btnSignOut.addEventListener('click', () => {
    showAccount()
    menu.newNameInput.focus()
  })

  buildMainActions()
  showAccount()
  menu.newNameInput.focus()
}

function initCanvas(): void {
  const shell = document.getElementById('shell')
  const canvas = document.getElementById('game')
  if (!(shell instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    return
  }

  const ro = new ResizeObserver(() => {
    layoutCanvas(canvas, shell)
  })
  ro.observe(shell)
  layoutCanvas(canvas, shell)
}

window.addEventListener('DOMContentLoaded', () => {
  initCanvas()
  initMenu()
})
