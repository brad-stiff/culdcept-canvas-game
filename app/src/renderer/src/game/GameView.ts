import type { GameState, LandedAction } from '../../../shared/game/types'
import {
  canRoll,
  createInitialState,
  getAvailableActions,
  getPhaseLabel,
  getSelectableCardIds,
  reduceGame
} from '../../../shared/game/state'

type Layout = {
  width: number
  height: number
  squarePositions: { x: number; y: number }[]
}

const PLAYER_COLORS = ['#5b9fd4', '#d45b7a']

export class GameView {
  private state: GameState
  private layout: Layout | null = null
  private onExit: () => void
  private boundClick: (e: MouseEvent) => void
  private boundKey: (e: KeyboardEvent) => void

  constructor(
    private canvas: HTMLCanvasElement,
    private shell: HTMLElement,
    playerNames: [string, string],
    onExit: () => void
  ) {
    this.state = createInitialState(playerNames)
    this.onExit = onExit
    this.boundClick = (e) => this.handleClick(e)
    this.boundKey = (e) => this.handleKey(e)
    this.canvas.addEventListener('click', this.boundClick)
    window.addEventListener('keydown', this.boundKey)
  }

  destroy(): void {
    this.canvas.removeEventListener('click', this.boundClick)
    window.removeEventListener('keydown', this.boundKey)
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.layout = computeLayout(cssWidth, cssHeight, this.state.config.board.length)
    this.draw(cssWidth, cssHeight)
  }

  private dispatch(action: Parameters<typeof reduceGame>[1]): void {
    this.state = reduceGame(this.state, action)
    const rect = this.shell.getBoundingClientRect()
    this.draw(rect.width, rect.height)
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.onExit()
      return
    }
    if (e.key === 'r' || e.key === 'R') {
      if (canRoll(this.state)) {
        this.dispatch({ type: 'roll_dice' })
      }
    }
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    if (hitRect(x, y, w - 110, 12, 96, 32)) {
      this.onExit()
      return
    }

    if (this.state.phase === 'roll' && hitRect(x, y, w / 2 - 70, h - 52, 140, 40)) {
      this.dispatch({ type: 'roll_dice' })
      return
    }

    if (this.state.phase === 'battle_result' && hitRect(x, y, w / 2 - 70, h - 52, 140, 40)) {
      this.dispatch({ type: 'acknowledge_battle' })
      return
    }

    const actions = getAvailableActions(this.state)
    const actionButtons = actions.filter((a) => a !== 'skip' || actions.length === 1)
    for (let i = 0; i < actionButtons.length; i++) {
      const bx = 16 + i * 130
      if (hitRect(x, y, bx, h - 52, 120, 40)) {
        this.dispatch({ type: 'choose_action', action: actionButtons[i] })
        return
      }
    }

    if (this.state.phase === 'landed' && actions.includes('skip') && actions.length > 1) {
      const skipX = 16 + actionButtons.length * 130
      if (hitRect(x, y, skipX, h - 52, 120, 40)) {
        this.dispatch({ type: 'choose_action', action: 'skip' })
        return
      }
    }

    const selectable = getSelectableCardIds(this.state)
    const hand = this.state.players[this.state.currentPlayerIndex].hand
    const cardW = 108
    const gap = 10
    const totalW = hand.length * cardW + (hand.length - 1) * gap
    const startX = (w - totalW) / 2
    const cardY = h - 160
    for (let i = 0; i < hand.length; i++) {
      const card = hand[i]
      const cx = startX + i * (cardW + gap)
      if (hitRect(x, y, cx, cardY, cardW, 88)) {
        if (selectable.includes(card.id)) {
          this.dispatch({ type: 'select_creature', cardId: card.id })
        }
        return
      }
    }
  }

  private draw(w: number, h: number): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx || !this.layout) return

    ctx.save()
    ctx.clearRect(0, 0, w, h)
    drawBackground(ctx, w, h)
    drawBoard(ctx, this.state, this.layout)
    drawHud(ctx, this.state, w)
    drawHand(ctx, this.state, w, h, getSelectableCardIds(this.state))
    drawActionBar(ctx, this.state, w, h)
    drawLog(ctx, this.state, w)
    ctx.restore()
  }
}

function hitRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h
}

function computeLayout(w: number, h: number, squareCount: number): Layout {
  const cx = w / 2
  const cy = h * 0.42
  const radius = Math.min(w, h) * 0.32
  const squarePositions: { x: number; y: number }[] = []
  for (let i = 0; i < squareCount; i++) {
    const angle = -Math.PI / 2 + (i / squareCount) * Math.PI * 2
    squarePositions.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    })
  }
  return { width: w, height: h, squarePositions }
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#141a24')
  g.addColorStop(1, '#0c0f14')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function terrainColor(terrain: string): string {
  switch (terrain) {
    case 'fire':
      return '#5c2e24'
    case 'water':
      return '#1e3a52'
    case 'earth':
      return '#3d3524'
    case 'air':
      return '#2a3350'
    default:
      return '#252a34'
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout): void {
  const { squarePositions } = layout
  const board = state.config.board
  const squareSize = Math.max(44, Math.min(layout.width, layout.height) * 0.08)

  for (let i = 0; i < board.length; i++) {
    const square = board[i]
    const pos = squarePositions[i]
    const territory = state.territories.find((t) => t.squareId === square.id)
    const ownerColor = territory ? PLAYER_COLORS[territory.ownerId] : null

    ctx.fillStyle = terrainColor(square.terrain)
    ctx.strokeStyle = ownerColor ?? 'rgba(255,255,255,0.2)'
    ctx.lineWidth = ownerColor ? 3 : 1
    roundRect(ctx, pos.x - squareSize / 2, pos.y - squareSize / 2, squareSize, squareSize, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#e8eaed'
    ctx.font = '11px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(square.name, pos.x, pos.y - squareSize / 2 + 6)

    if (territory) {
      ctx.font = '10px system-ui,sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(territory.creature.name, pos.x, pos.y + 4)
    }

    if (square.squareType === 'castle') {
      ctx.font = '18px system-ui,sans-serif'
      ctx.fillText('🏰', pos.x, pos.y - 8)
    }
  }

  for (const player of state.players) {
    const pos = squarePositions[player.position]
    const offset = player.id === 0 ? -10 : 10
    ctx.beginPath()
    ctx.fillStyle = player.color
    ctx.arc(pos.x + offset, pos.y + squareSize / 2 + 12, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(player.name.slice(0, 1).toUpperCase(), pos.x + offset, pos.y + squareSize / 2 + 12)
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number): void {
  ctx.fillStyle = 'rgba(12,16,22,0.85)'
  roundRect(ctx, 12, 12, w - 24, 72, 10)
  ctx.fill()

  const p0 = state.players[0]
  const p1 = state.players[1]
  ctx.font = '14px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = p0.color
  ctx.fillText(`${p0.name}: ${p0.gold}g`, 24, 24)
  ctx.fillStyle = p1.color
  ctx.fillText(`${p1.name}: ${p1.gold}g`, 24, 44)

  ctx.fillStyle = '#e8eaed'
  ctx.textAlign = 'center'
  ctx.font = '15px system-ui,sans-serif'
  ctx.fillText(getPhaseLabel(state), w / 2, 28)
  if (state.lastRoll !== null && state.phase !== 'roll') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '13px system-ui,sans-serif'
    ctx.fillText(`Last roll: ${state.lastRoll}`, w / 2, 50)
  }

  drawButton(ctx, w - 110, 12, 96, 32, 'Menu (Esc)', false)
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
  selectable: string[]
): void {
  const player = state.players[state.currentPlayerIndex]
  const cardW = 108
  const gap = 10
  const totalW = player.hand.length * cardW + (player.hand.length - 1) * gap
  const startX = (w - totalW) / 2
  const cardY = h - 160

  for (let i = 0; i < player.hand.length; i++) {
    const card = player.hand[i]
    const x = startX + i * (cardW + gap)
    const active = selectable.includes(card.id)
    ctx.fillStyle = active ? '#2a3548' : '#1a1f28'
    ctx.strokeStyle = active ? '#7eb6e8' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = active ? 2 : 1
    roundRect(ctx, x, cardY, cardW, 88, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#e8eaed'
    ctx.font = 'bold 12px system-ui,sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(card.name, x + 8, cardY + 8)
    ctx.font = '11px system-ui,sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`${card.element} · ${card.cost}g`, x + 8, cardY + 26)
    ctx.fillText(`ATK ${card.attack} / DEF ${card.defense}`, x + 8, cardY + 42)
  }
}

function drawActionBar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number
): void {
  const y = h - 52
  if (state.phase === 'roll') {
    drawButton(ctx, w / 2 - 70, y, 140, 40, 'Roll dice (R)', true)
    return
  }
  if (state.phase === 'battle_result') {
    const msg = state.lastBattle?.message ?? 'Battle over'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '13px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(msg, w / 2, y - 18)
    drawButton(ctx, w / 2 - 70, y, 140, 40, 'Continue', true)
    return
  }

  const actions = getAvailableActions(state)
  const labels: Record<LandedAction, string> = {
    place: 'Place creature',
    battle: 'Battle',
    pay_toll: 'Pay toll',
    skip: 'Skip'
  }
  let i = 0
  for (const action of actions) {
    if (action === 'skip' && actions.length > 1) continue
    drawButton(ctx, 16 + i * 130, y, 120, 40, labels[action], true)
    i++
  }
  if (actions.includes('skip') && actions.length > 1) {
    drawButton(ctx, 16 + i * 130, y, 120, 40, 'Skip', true)
  }

  if (state.phase === 'select_creature') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '13px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Click a highlighted card in your hand', w / 2, y - 18)
  }
}

function drawLog(ctx: CanvasRenderingContext2D, state: GameState, w: number): void {
  const lines = state.log.slice(-4)
  ctx.font = '12px system-ui,sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], w - 20, 96 + i * 16)
  }

  if (state.phase === 'game_over' && state.winnerId !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, w, ctx.canvas.height)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${state.players[state.winnerId].name} wins!`, w / 2, ctx.canvas.height / 2 - 16)
    ctx.font = '16px system-ui,sans-serif'
    ctx.fillText('Press Esc for menu', w / 2, ctx.canvas.height / 2 + 20)
  }
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  primary: boolean
): void {
  ctx.fillStyle = primary ? '#3d6ea8' : '#2a3140'
  roundRect(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = '13px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + w / 2, y + h / 2)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
