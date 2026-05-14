import '../assets/shell.css'
import { backingSizeForCssBox } from '../../shared/canvasLayout'

const STORAGE_KEY = 'culdcept_canvas_accounts_v1'

type StoredAccount = {
  id: string
  name: string
  createdAt: string
}

const MAIN_ACTIONS: { id: string; title: string; subtitle: string }[] = [
  { id: 'story', title: 'Story', subtitle: 'Campaign (stub)' },
  { id: 'quick', title: 'Quick game', subtitle: 'Skirmish (stub)' },
  { id: 'library', title: 'Card library', subtitle: 'Browse cards (stub)' },
  { id: 'deck', title: 'Deck builder', subtitle: 'Compose decks (stub)' },
  { id: 'card', title: 'Card builder', subtitle: 'Author cards (stub)' },
  { id: 'board', title: 'Board builder', subtitle: 'Maps & boards (stub)' },
  { id: 'avatar', title: 'Avatar builder', subtitle: 'Player look (stub)' }
]

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = Math.max(1, Math.round(Math.min(w, h) * 0.002))
  const step = 48
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(232, 234, 237, 0.85)'
  ctx.font = `${Math.round(Math.min(w, h) * 0.06)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Canvas (no loop yet)', w / 2, h / 2)
  ctx.restore()
}

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
  drawPlaceholder(ctx, cssWidth, cssHeight)
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

  if (
    !(screenAccount instanceof HTMLElement) ||
    !(screenMain instanceof HTMLElement) ||
    !(newNameInput instanceof HTMLInputElement) ||
    !(btnCreate instanceof HTMLButtonElement) ||
    !(existingSelect instanceof HTMLSelectElement) ||
    !(btnExisting instanceof HTMLButtonElement) ||
    !(accountHint instanceof HTMLParagraphElement) ||
    !(mainUserLine instanceof HTMLParagraphElement) ||
    !(mainActions instanceof HTMLUListElement) ||
    !(stubNote instanceof HTMLParagraphElement) ||
    !(btnSignOut instanceof HTMLButtonElement) ||
    !(hudStatus instanceof HTMLDivElement)
  ) {
    return
  }

  function setHint(text: string, isError: boolean): void {
    accountHint.textContent = text
    accountHint.classList.toggle('is-error', isError)
  }

  function refreshAccountSelect(): void {
    const accounts = readAccounts()
    const current = existingSelect.value
    existingSelect.innerHTML = ''
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = accounts.length ? '— Select —' : 'No saved accounts yet'
    existingSelect.appendChild(placeholder)
    for (const a of accounts) {
      const opt = document.createElement('option')
      opt.value = a.id
      opt.textContent = a.name
      existingSelect.appendChild(opt)
    }
    if (accounts.some((a) => a.id === current)) {
      existingSelect.value = current
    }
    btnExisting.disabled = accounts.length === 0
  }

  function showAccount(): void {
    screenAccount.hidden = false
    screenMain.hidden = true
    newNameInput.value = ''
    setHint('', false)
    refreshAccountSelect()
    stubNote.textContent = ''
    hudStatus.textContent = 'HUD — not signed in'
  }

  function showMain(account: StoredAccount): void {
    screenAccount.hidden = true
    screenMain.hidden = false
    mainUserLine.textContent = `Signed in as ${account.name}`
    hudStatus.textContent = `HUD — ${account.name}`
  }

  function buildMainActions(): void {
    mainActions.innerHTML = ''
    for (const action of MAIN_ACTIONS) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.stubId = action.id
      btn.innerHTML = `${action.title}<span>${action.subtitle}</span>`
      btn.addEventListener('click', () => {
        stubNote.textContent = `${action.title}: stub — not implemented yet.`
      })
      li.appendChild(btn)
      mainActions.appendChild(li)
    }
  }

  btnCreate.addEventListener('click', () => {
    const name = normalizeName(newNameInput.value)
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

  btnExisting.addEventListener('click', () => {
    const id = existingSelect.value
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

  btnSignOut.addEventListener('click', () => {
    showAccount()
    newNameInput.focus()
  })

  buildMainActions()
  showAccount()
  newNameInput.focus()
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
