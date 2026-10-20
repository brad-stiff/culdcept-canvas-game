import { runAiUntilHuman } from '../../../shared/game/ai'
import { totalMagic } from '../../../shared/game/economy'
import { colosseumLayoutPositions } from '../../../shared/game/maps/colosseum'
import {
  canRoll,
  getAvailableActions,
  getPhaseLabel,
  getSelectableCardIds,
  reduceGame,
  startMatch
} from '../../../shared/game/state'
import type { GameState, LandedAction, MatchSeat } from '../../../shared/game/types'

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
  private aiTimer: number | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private shell: HTMLElement,
    seats: [MatchSeat, MatchSeat],
    onExit: () => void
  ) {
    this.state = startMatch(seats)
    this.onExit = onExit
    this.boundClick = (e) => this.handleClick(e)
    this.boundKey = (e) => this.handleKey(e)
    this.canvas.addEventListener('click', this.boundClick)
    window.addEventListener('keydown', this.boundKey)
    this.queueAi()
  }

  destroy(): void {
    this.canvas.removeEventListener('click', this.boundClick)
    window.removeEventListener('keydown', this.boundKey)
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer)
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.layout = computeLayout(cssWidth, cssHeight, this.state.config.board.length)
    this.draw(cssWidth, cssHeight)
  }

  private dispatch(action: Parameters<typeof reduceGame>[1]): void {
    this.state = reduceGame(this.state, action)
    this.state = runAiUntilHuman(this.state)
    const rect = this.shell.getBoundingClientRect()
    this.draw(rect.width, rect.height)
    this.queueAi()
  }

  private queueAi(): void {
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer)
    const player = this.state.players[this.state.currentPlayerIndex]
    if (!player.isAi || this.state.phase === 'game_over') return
    this.aiTimer = window.setTimeout(() => {
      this.state = runAiUntilHuman(this.state)
      const rect = this.shell.getBoundingClientRect()
      this.draw(rect.width, rect.height)
      this.queueAi()
    }, 350)
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.onExit()
      return
    }
    if (this.state.players[this.state.currentPlayerIndex].isAi) return
    if (e.key === 'r' || e.key === 'R') {
      if (canRoll(this.state)) this.dispatch({ type: 'roll_dice' })
    }
  }

  private handleClick(e: MouseEvent): void {
    if (this.state.players[this.state.currentPlayerIndex].isAi) return

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

    if (this.state.phase === 'select_item' && hitRect(x, y, w / 2 - 70, h - 52, 140, 40)) {
      this.dispatch({ type: 'select_item', cardId: null })
      return
    }

    const actions = getAvailableActions(this.state)
    let i = 0
    for (const action of actions) {
      if (action === 'skip' && actions.length > 1) continue
      const bx = 16 + i * 118
      if (hitRect(x, y, bx, h - 52, 110, 40)) {
        this.dispatch({ type: 'choose_action', action })
        return
      }
      i++
    }
    if (actions.includes('skip') && actions.length > 1) {
      const bx = 16 + i * 118
      if (hitRect(x, y, bx, h - 52, 110, 40)) {
        this.dispatch({ type: 'choose_action', action: 'skip' })
        return
      }
    }

    const selectable = getSelectableCardIds(this.state)
    const hand = this.state.players[this.state.currentPlayerIndex].hand
    const cardW = 100
    const gap = 8
    const totalW = hand.length * cardW + Math.max(0, hand.length - 1) * gap
    const startX = (w - totalW) / 2
    const cardY = h - 168
    for (let hi = 0; hi < hand.length; hi++) {
      const card = hand[hi]
      const cx = startX + hi * (cardW + gap)
      if (hitRect(x, y, cx, cardY, cardW, 96)) {
        if (!selectable.includes(card.instanceId)) return
        if (this.state.phase === 'select_spell') {
          this.dispatch({ type: 'select_spell', cardId: card.instanceId })
        } else if (this.state.phase === 'select_item') {
          this.dispatch({ type: 'select_item', cardId: card.instanceId })
        } else {
          this.dispatch({ type: 'select_creature', cardId: card.instanceId })
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
  const cy = h * 0.4
  const radiusX = Math.min(w, h) * 0.36
  const radiusY = Math.min(w, h) * 0.28
  return {
    width: w,
    height: h,
    squarePositions: colosseumLayoutPositions(squareCount, cx, cy, radiusX, radiusY)
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(40, 48, 36, 0.35)'
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.42, Math.min(w, h) * 0.42, Math.min(w, h) * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
}

function terrainColor(terrain: string): string {
  switch (terrain) {
    case 'fire':
      return '#6b3030'
    case 'water':
      return '#2a4a6e'
    case 'earth':
      return '#5a4a28'
    case 'air':
      return '#3a5a48'
    default:
      return '#3a3f4a'
  }
}

function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout): void {
  const { squarePositions } = layout
  const board = state.config.board
  const squareSize = Math.max(40, Math.min(layout.width, layout.height) * 0.07)

  for (let i = 0; i < board.length; i++) {
    const a = squarePositions[i]
    const b = squarePositions[(i + 1) % board.length]
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  for (let i = 0; i < board.length; i++) {
    const square = board[i]
    const pos = squarePositions[i]
    const territory = state.territories.find((t) => t.squareId === square.id)
    const ownerColor = territory ? PLAYER_COLORS[territory.ownerId] : null

    ctx.fillStyle = terrainColor(square.terrain)
    ctx.strokeStyle = ownerColor ?? 'rgba(255,255,255,0.25)'
    ctx.lineWidth = ownerColor ? 3 : 1
    roundRect(ctx, pos.x - squareSize / 2, pos.y - squareSize / 2, squareSize, squareSize, 6)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#e8eaed'
    ctx.font = '10px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (square.squareType === 'castle') ctx.fillText('Castle', pos.x, pos.y)
    else if (square.squareType === 'fort') ctx.fillText('Fort', pos.x, pos.y)
    else if (square.squareType === 'shrine') ctx.fillText('Shrine', pos.x, pos.y)
    else if (territory) ctx.fillText(`L${territory.level}`, pos.x, pos.y)
    else ctx.fillText(square.terrain[0]!.toUpperCase(), pos.x, pos.y)
  }

  for (const player of state.players) {
    const pos = squarePositions[player.position]
    const offset = player.id === 0 ? -12 : 12
    ctx.beginPath()
    ctx.fillStyle = player.color
    ctx.arc(pos.x + offset, pos.y + squareSize / 2 + 10, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(player.name.slice(0, 1).toUpperCase(), pos.x + offset, pos.y + squareSize / 2 + 10)
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number): void {
  ctx.fillStyle = 'rgba(12,16,22,0.88)'
  roundRect(ctx, 12, 12, w - 24, 78, 10)
  ctx.fill()

  const p0 = state.players[0]
  const p1 = state.players[1]
  ctx.font = '13px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = p0.color
  ctx.fillText(
    `${p0.name}${p0.isAi ? ' (AI)' : ''}: ${p0.magic}G · total ${totalMagic(state, p0)}G`,
    24,
    22
  )
  ctx.fillStyle = p1.color
  ctx.fillText(
    `${p1.name}${p1.isAi ? ' (AI)' : ''}: ${p1.magic}G · total ${totalMagic(state, p1)}G`,
    24,
    42
  )

  ctx.fillStyle = '#e8eaed'
  ctx.textAlign = 'center'
  ctx.font = '14px system-ui,sans-serif'
  ctx.fillText(`${state.config.mapName} — ${getPhaseLabel(state)}`, w / 2, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '12px system-ui,sans-serif'
  ctx.fillText(`Goal ${state.config.targetMagic}G`, w / 2, 46)
  if (state.lastRoll !== null && state.phase !== 'roll') {
    ctx.fillText(`Last roll: ${state.lastRoll}`, w / 2, 62)
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
  const cardW = 100
  const gap = 8
  const totalW = player.hand.length * cardW + Math.max(0, player.hand.length - 1) * gap
  const startX = (w - totalW) / 2
  const cardY = h - 168

  for (let i = 0; i < player.hand.length; i++) {
    const card = player.hand[i]
    const x = startX + i * (cardW + gap)
    const active = selectable.includes(card.instanceId)
    ctx.fillStyle = active ? '#2a3548' : '#1a1f28'
    ctx.strokeStyle = active ? '#7eb6e8' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = active ? 2 : 1
    roundRect(ctx, x, cardY, cardW, 96, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#e8eaed'
    ctx.font = 'bold 11px system-ui,sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(card.name.slice(0, 12), x + 6, cardY + 6)
    ctx.font = '10px system-ui,sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.fillText(`${card.kind} · ${card.cost}G`, x + 6, cardY + 24)
    if (card.kind === 'creature') {
      ctx.fillText(`ST ${card.st} / HP ${card.hp}`, x + 6, cardY + 40)
      ctx.fillText(String(card.element ?? '—'), x + 6, cardY + 56)
    }
  }
}

function drawActionBar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number
): void {
  const y = h - 52
  if (state.players[state.currentPlayerIndex].isAi) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '13px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('AI is thinking…', w / 2, y + 20)
    return
  }
  if (state.phase === 'roll') {
    drawButton(ctx, w / 2 - 70, y, 140, 40, 'Roll dice (R)', true)
    return
  }
  if (state.phase === 'battle_result') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '12px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.lastBattle?.message ?? 'Battle over', w / 2, y - 16)
    drawButton(ctx, w / 2 - 70, y, 140, 40, 'Continue', true)
    return
  }
  if (state.phase === 'select_item') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '12px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Click an item or No item', w / 2, y - 16)
    drawButton(ctx, w / 2 - 70, y, 140, 40, 'No item', true)
    return
  }

  const actions = getAvailableActions(state)
  const labels: Record<LandedAction, string> = {
    place: 'Summon',
    battle: 'Invade',
    pay_toll: 'Pay toll',
    level_up: 'Level up',
    cast_spell: 'Spell',
    shrine: 'Pray',
    skip: 'Skip'
  }
  let i = 0
  for (const action of actions) {
    if (action === 'skip' && actions.length > 1) continue
    drawButton(ctx, 16 + i * 118, y, 110, 40, labels[action], true)
    i++
  }
  if (actions.includes('skip') && actions.length > 1) {
    drawButton(ctx, 16 + i * 118, y, 110, 40, 'Skip', true)
  }

  if (state.phase === 'select_creature' || state.phase === 'select_spell') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '12px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Click a highlighted card', w / 2, y - 16)
  }
}

function drawLog(ctx: CanvasRenderingContext2D, state: GameState, w: number): void {
  const lines = state.log.slice(-5)
  ctx.font = '11px system-ui,sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i].slice(0, 64), w - 20, 100 + i * 14)
  }

  if (state.phase === 'game_over' && state.winnerId !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, w, ctx.canvas.height)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 26px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${state.players[state.winnerId].name} wins!`, w / 2, ctx.canvas.height / 2 - 16)
    ctx.font = '15px system-ui,sans-serif'
    ctx.fillText('Press Esc for menu', w / 2, ctx.canvas.height / 2 + 18)
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
  ctx.font = '12px system-ui,sans-serif'
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
