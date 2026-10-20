import '../assets/shell.css'
import { backingSizeForCssBox } from '../../shared/canvasLayout'
import { startMatch } from '../../shared/game/state'
import type { MatchSeat } from '../../shared/game/types'
import { filledSeats, type FreeBattleLobbyConfig } from '../../shared/lobby/types'
import { GameView } from './game/GameView'
import {
  createClientSession,
  createHostSession,
  sendClientAction,
  type ClientSession,
  type HostSession
} from './lan/session'
import { resolveBookCatalogIds } from './ui/books'
import { createDeckBuilderController } from './ui/deckBuilder'
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
  { id: 'free', title: 'Free Battle', subtitle: '2–4p · maps · LAN' },
  { id: 'library', title: 'Card library', subtitle: 'Browse Saga catalog' },
  { id: 'deck', title: 'Deck builder', subtitle: 'Compose 50-card books' },
  { id: 'card', title: 'Card builder', subtitle: 'Author cards (stub)' },
  { id: 'board', title: 'Board builder', subtitle: 'Maps & boards (stub)' },
  { id: 'avatar', title: 'Avatar builder', subtitle: 'Player look (stub)' }
]

let activeGame: GameView | null = null
let activeAccountName = 'Player'
let activeAccountId = ''
let hostSession: HostSession | null = null
let clientSession: ClientSession | null = null
let lanClientId: string | null = null
let lanPlayerId: number | null = null

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
  ctx.fillText('Choose Free Battle from the menu', w / 2, h / 2)
  ctx.restore()
}

function seatsFromLobbyConfig(config: FreeBattleLobbyConfig): MatchSeat[] {
  return filledSeats(config).map((s) => {
    const catalogIds = resolveBookCatalogIds(activeAccountId, s.bookId ?? 'starter')
    return {
      name: s.name,
      isAi: s.kind === 'ai',
      ...(catalogIds ? { bookCatalogIds: catalogIds } : {})
    }
  })
}

function stopLanSessions(): void {
  hostSession?.dispose()
  hostSession = null
  clientSession?.dispose()
  clientSession = null
}

function startLocalFreeBattle(
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

  const matchSeats = seatsFromLobbyConfig(config)
  const initialState = startMatch(matchSeats, { mapId: config.mapId || 'colosseum-i' })
  activeGame = new GameView(canvas, shell, { initialState }, onEnd)

  menuLayer.classList.add('menu-layer-dismissed')
  stubNote.textContent = ''
  hudStatus.textContent = `${initialState.config.mapName} — ${matchSeats.map((s) => s.name).join(' · ')}`
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
  stopLanSessions()
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
  const lobbyMapRow = document.getElementById('lobby-map-row')
  const lobbyHint = document.getElementById('lobby-hint')
  const lobbyModes = document.getElementById('lobby-modes')
  const lobbyLanPanel = document.getElementById('lobby-lan-panel')
  const btnLobbyStart = document.getElementById('btn-lobby-start')
  const btnLobbyBack = document.getElementById('btn-lobby-back')
  const libraryList = document.getElementById('library-list')
  const libraryDetail = document.getElementById('library-detail')
  const libraryCountLine = document.getElementById('library-count-line')
  const librarySearch = document.getElementById('library-search')
  const libraryKind = document.getElementById('library-kind')
  const libraryElement = document.getElementById('library-element')
  const btnLibraryBack = document.getElementById('btn-library-back')
  const screenDeck = document.getElementById('screen-deck')
  const deckCatalog = document.getElementById('deck-catalog')
  const deckBook = document.getElementById('deck-book')
  const deckStatus = document.getElementById('deck-status')
  const deckName = document.getElementById('deck-name')
  const deckSaved = document.getElementById('deck-saved')
  const deckSearch = document.getElementById('deck-search')
  const deckKind = document.getElementById('deck-kind')
  const btnDeckSave = document.getElementById('btn-deck-save')
  const btnDeckNew = document.getElementById('btn-deck-new')
  const btnDeckDelete = document.getElementById('btn-deck-delete')
  const btnDeckBack = document.getElementById('btn-deck-back')

  if (
    !(screenAccount instanceof HTMLElement) ||
    !(screenMain instanceof HTMLElement) ||
    !(screenLobby instanceof HTMLElement) ||
    !(screenLibrary instanceof HTMLElement) ||
    !(screenDeck instanceof HTMLElement) ||
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
    !(lobbyMapRow instanceof HTMLElement) ||
    !(lobbyHint instanceof HTMLParagraphElement) ||
    !(lobbyModes instanceof HTMLElement) ||
    !(lobbyLanPanel instanceof HTMLElement) ||
    !(btnLobbyStart instanceof HTMLButtonElement) ||
    !(btnLobbyBack instanceof HTMLButtonElement) ||
    !(libraryList instanceof HTMLUListElement) ||
    !(libraryDetail instanceof HTMLElement) ||
    !(libraryCountLine instanceof HTMLParagraphElement) ||
    !(librarySearch instanceof HTMLInputElement) ||
    !(libraryKind instanceof HTMLSelectElement) ||
    !(libraryElement instanceof HTMLSelectElement) ||
    !(btnLibraryBack instanceof HTMLButtonElement) ||
    !(deckCatalog instanceof HTMLElement) ||
    !(deckBook instanceof HTMLElement) ||
    !(deckStatus instanceof HTMLParagraphElement) ||
    !(deckName instanceof HTMLInputElement) ||
    !(deckSaved instanceof HTMLSelectElement) ||
    !(deckSearch instanceof HTMLInputElement) ||
    !(deckKind instanceof HTMLSelectElement) ||
    !(btnDeckSave instanceof HTMLButtonElement) ||
    !(btnDeckNew instanceof HTMLButtonElement) ||
    !(btnDeckDelete instanceof HTMLButtonElement) ||
    !(btnDeckBack instanceof HTMLButtonElement)
  ) {
    return
  }

  const menu = {
    screenAccount,
    screenMain,
    screenLobby,
    screenLibrary,
    screenDeck,
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
  let deckBuilder!: ReturnType<typeof createDeckBuilderController>

  function hideAllScreens(): void {
    menu.screenAccount.hidden = true
    menu.screenMain.hidden = true
    lobby.hide()
    library.hide()
    deckBuilder.hide()
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
    activeAccountId = account.id
  }

  const returnToMain = (): void => {
    endFreeBattle(menu.menuLayer, menu.hudStatus, menu.stubNote)
    hideAllScreens()
    menu.screenMain.hidden = false
  }

  lobby = createLobbyController({
    root: screenLobby,
    seatsEl: lobbySeats,
    mapRowEl: lobbyMapRow,
    hintEl: lobbyHint,
    startBtn: btnLobbyStart,
    backBtn: btnLobbyBack,
    modeRowEl: lobbyModes,
    lanPanelEl: lobbyLanPanel,
    getAccountId: () => activeAccountId,
    onBack: () => {
      stopLanSessions()
      hideAllScreens()
      menu.screenMain.hidden = false
    },
    onStopLan: () => {
      stopLanSessions()
    },
    onStartLocal: (config) => {
      hideAllScreens()
      startLocalFreeBattle(
        menu.canvas,
        menu.shell,
        menu.menuLayer,
        menu.hudStatus,
        menu.stubNote,
        config,
        returnToMain
      )
    },
    onHostReady: async (config, clientId) => {
      lanClientId = clientId
      hostSession?.dispose()
      hostSession = await createHostSession({
        lobby: config,
        hostClientId: clientId,
        resolveBook: (bookId) => resolveBookCatalogIds(activeAccountId, bookId),
        onLobbyChange: (lobbyConfig) => lobby.applyRemoteLobby(lobbyConfig),
        onStatus: (text) => lobby.setLanInfo(text),
        onState: (state) => {
          if (!activeGame) {
            const hostPid =
              filledSeats(hostSession!.getLobby()).findIndex(
                (s) => s.kind === 'human' && s.clientId === clientId
              ) ?? 0
            activeGame = new GameView(
              menu.canvas,
              menu.shell,
              {
                initialState: state,
                localPlayerId: hostPid >= 0 ? hostPid : 0,
                runAi: false,
                onLocalAction: (action) => hostSession?.applyHostAction(action)
              },
              returnToMain
            )
            menu.menuLayer.classList.add('menu-layer-dismissed')
            menu.hudStatus.textContent = `${state.config.mapName} — LAN host`
            layoutCanvas(menu.canvas, menu.shell)
            hideAllScreens()
          }
          activeGame.setState(state)
        }
      })
      hostSession.setLobby(config)
    },
    onHostStartMatch: (config, clientId) => {
      if (!hostSession) {
        lobby.setStatus('Open LAN first.', true)
        return
      }
      lanClientId = clientId
      hostSession.setLobby(config)
      hostSession.startMatch()
    },
    onJoin: async (host, port, name, clientId) => {
      lanClientId = clientId
      clientSession?.dispose()
      clientSession = await createClientSession({
        host,
        port,
        name,
        clientId,
        onWelcome: (playerId, lobbyConfig) => {
          lobby.applyRemoteLobby(lobbyConfig)
          lobby.setStatus(
            playerId == null
              ? 'Connected — waiting for a human seat.'
              : `Connected as seat ${playerId + 1}.`,
            playerId == null
          )
        },
        onLobby: (lobbyConfig) => lobby.applyRemoteLobby(lobbyConfig),
        onMatchStart: (_seats, yourPlayerId) => {
          lanPlayerId = yourPlayerId
          menu.hudStatus.textContent = `LAN client (P${yourPlayerId + 1})`
        },
        onState: (state) => {
          if (!activeGame) {
            activeGame = new GameView(
              menu.canvas,
              menu.shell,
              {
                initialState: state,
                localPlayerId: lanPlayerId ?? 0,
                runAi: false,
                onLocalAction: (action) => {
                  if (lanClientId) sendClientAction(lanClientId, action)
                }
              },
              returnToMain
            )
            menu.menuLayer.classList.add('menu-layer-dismissed')
            layoutCanvas(menu.canvas, menu.shell)
            hideAllScreens()
          } else {
            activeGame.setState(state)
          }
        },
        onError: (message) => lobby.setStatus(message, true),
        onDisconnected: () => lobby.setStatus('Disconnected from host.', true)
      })
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

  deckBuilder = createDeckBuilderController({
    root: screenDeck,
    catalogEl: deckCatalog,
    bookEl: deckBook,
    statusEl: deckStatus,
    nameInput: deckName,
    savedSelect: deckSaved,
    searchInput: deckSearch,
    kindSelect: deckKind,
    btnSave: btnDeckSave,
    btnNew: btnDeckNew,
    btnDelete: btnDeckDelete,
    backBtn: btnDeckBack,
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
        if (action.id === 'deck') {
          if (!activeAccountId) {
            menu.stubNote.textContent = 'Sign in to use the deck builder.'
            return
          }
          hideAllScreens()
          deckBuilder.show(activeAccountId)
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
