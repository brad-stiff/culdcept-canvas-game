import { chooseAiAction } from '../../../shared/game/ai'
import { totalMagic } from '../../../shared/game/economy'
import { loopLayoutPositions } from '../../../shared/game/maps/layout'
import { PLAYER_COLORS } from '../../../shared/game/playerColors'
import {
  canRoll,
  getAvailableActions,
  getMoveTargets,
  getPathChoices,
  getPhaseLabel,
  getSelectableCardIds,
  reduceGame,
  startMatch
} from '../../../shared/game/state'
import type {
  GameAction,
  GameConfig,
  GameState,
  LandedAction,
  MatchSeat,
  Player
} from '../../../shared/game/types'
import { createDiceSpin, diceProgress, diceRotation, drawDie, type DiceSpin } from './dice'
import { easeInOut, lerp, movementPlan } from './motion'

type Layout = {
  width: number
  height: number
  squarePositions: { x: number; y: number }[]
}

type Fx =
  | { kind: 'idle' }
  | {
      kind: 'dice'
      playerId: number
      fromId: number
      path: number[]
      spin: DiceSpin
    }
  | {
      kind: 'walk'
      playerId: number
      fromId: number
      path: number[]
      startMs: number
      stepMs: number
    }

const WALK_STEP_MS = 200

export type GameViewOptions = {
  seats?: MatchSeat[]
  /** When set, only this player may act locally (LAN client / host seat). */
  localPlayerId?: number | null
  /** Host-authoritative remote: push actions outward instead of reducing locally. */
  onLocalAction?: (action: GameAction) => void
  /** If false, do not run local AI (LAN clients). Default true. */
  runAi?: boolean
  initialState?: GameState
}

export class GameView {
  private state: GameState
  private layout: Layout | null = null
  private onExit: () => void
  private boundClick: (e: MouseEvent) => void
  private boundKey: (e: KeyboardEvent) => void
  private aiTimer: number | null = null
  private raf: number | null = null
  private fx: Fx = { kind: 'idle' }
  private localPlayerId: number | null
  private onLocalAction: ((action: GameAction) => void) | null
  private runAiFlag: boolean

  constructor(
    private canvas: HTMLCanvasElement,
    private shell: HTMLElement,
    options: GameViewOptions | MatchSeat[],
    onExit: () => void
  ) {
    const opts: GameViewOptions = Array.isArray(options) ? { seats: options } : options
    this.state = opts.initialState ?? startMatch(opts.seats ?? [])
    this.localPlayerId = opts.localPlayerId === undefined ? null : opts.localPlayerId
    this.onLocalAction = opts.onLocalAction ?? null
    this.runAiFlag = opts.runAi !== false
    this.onExit = onExit
    this.boundClick = (e) => this.handleClick(e)
    this.boundKey = (e) => this.handleKey(e)
    this.canvas.addEventListener('click', this.boundClick)
    window.addEventListener('keydown', this.boundKey)
    this.queueAi()
  }

  getState(): GameState {
    return this.state
  }

  /** Apply authoritative state from LAN host. */
  setState(state: GameState): void {
    const prev = this.state
    this.state = state
    this.beginPresentation(prev, state)
  }

  destroy(): void {
    this.canvas.removeEventListener('click', this.boundClick)
    window.removeEventListener('keydown', this.boundKey)
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer)
    if (this.raf !== null) window.cancelAnimationFrame(this.raf)
    this.fx = { kind: 'idle' }
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.layout = computeLayout(cssWidth, cssHeight, this.state.config)
    this.draw(cssWidth, cssHeight, performance.now())
  }

  private canControlCurrent(): boolean {
    if (this.fx.kind !== 'idle') return false
    const player = this.state.players[this.state.currentPlayerIndex]
    if (!player || player.isAi) return false
    if (this.localPlayerId == null) return true
    return player.id === this.localPlayerId
  }

  private dispatch(action: GameAction): void {
    if (this.onLocalAction) {
      this.onLocalAction(action)
      return
    }
    const prev = this.state
    this.state = reduceGame(this.state, action)
    this.beginPresentation(prev, this.state)
  }

  private beginPresentation(prev: GameState, next: GameState): void {
    const plan = movementPlan(prev, next)
    if (!plan) {
      this.fx = { kind: 'idle' }
      this.drawNow()
      this.queueAi()
      return
    }
    const now = performance.now()
    if (plan.dice) {
      this.fx = {
        kind: 'dice',
        playerId: plan.playerId,
        fromId: plan.fromId,
        path: plan.path,
        spin: createDiceSpin(plan.dice.result, plan.dice.maxDie, now)
      }
    } else {
      this.fx = {
        kind: 'walk',
        playerId: plan.playerId,
        fromId: plan.fromId,
        path: plan.path,
        startMs: now,
        stepMs: WALK_STEP_MS
      }
    }
    this.startLoop()
  }

  private startLoop(): void {
    if (this.raf !== null) return
    const tick = (now: number): void => {
      this.advanceFx(now)
      this.drawNow(now)
      if (this.fx.kind === 'idle') {
        this.raf = null
        this.queueAi()
        return
      }
      this.raf = window.requestAnimationFrame(tick)
    }
    this.raf = window.requestAnimationFrame(tick)
  }

  private advanceFx(now: number): void {
    if (this.fx.kind === 'dice') {
      if (diceProgress(this.fx.spin, now) < 1) return
      if (this.fx.path.length === 0) {
        this.fx = { kind: 'idle' }
        return
      }
      this.fx = {
        kind: 'walk',
        playerId: this.fx.playerId,
        fromId: this.fx.fromId,
        path: this.fx.path,
        startMs: now,
        stepMs: WALK_STEP_MS
      }
      return
    }
    if (this.fx.kind === 'walk') {
      const total = this.fx.path.length * this.fx.stepMs
      if (now - this.fx.startMs >= total) this.fx = { kind: 'idle' }
    }
  }

  private drawNow(now = performance.now()): void {
    const rect = this.shell.getBoundingClientRect()
    this.draw(rect.width, rect.height, now)
  }

  private queueAi(): void {
    if (!this.runAiFlag || this.onLocalAction) return
    if (this.fx.kind !== 'idle') return
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer)
    const player = this.state.players[this.state.currentPlayerIndex]
    if (!player?.isAi || this.state.phase === 'game_over') return
    this.aiTimer = window.setTimeout(() => {
      const action = chooseAiAction(this.state)
      if (!action) return
      this.dispatch(action)
    }, 280)
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.onExit()
      return
    }
    if (!this.canControlCurrent()) return
    if (e.key === 'r' || e.key === 'R') {
      if (canRoll(this.state)) this.dispatch({ type: 'roll_dice' })
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

    if (!this.canControlCurrent()) return

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

    const pathIds =
      this.state.phase === 'choose_path'
        ? getPathChoices(this.state)
        : this.state.phase === 'select_square'
          ? getMoveTargets(this.state)
          : []
    if (this.layout && pathIds.length > 0) {
      const squareSize = Math.max(40, Math.min(this.layout.width, this.layout.height) * 0.07)
      for (const id of pathIds) {
        const idx = this.state.config.board.findIndex((s) => s.id === id)
        const pos = this.layout.squarePositions[idx >= 0 ? idx : id]
        if (!pos) continue
        if (hitRect(x, y, pos.x - squareSize / 2, pos.y - squareSize / 2, squareSize, squareSize)) {
          if (this.state.phase === 'choose_path')
            this.dispatch({ type: 'choose_path', squareId: id })
          else this.dispatch({ type: 'select_square', squareId: id })
          return
        }
      }
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

  private pieceXY(player: Player, layout: Layout, now: number): { x: number; y: number } {
    const board = this.state.config.board
    const squareSize = Math.max(40, Math.min(layout.width, layout.height) * 0.07)
    const offset = player.id === 0 ? -12 : player.id === 1 ? 12 : player.id === 2 ? -22 : 22
    const atSquare = (id: number): { x: number; y: number } => {
      const p = posForId(layout, board, id)
      return { x: p.x + offset, y: p.y + squareSize / 2 + 10 }
    }
    if (this.fx.kind !== 'idle' && this.fx.playerId === player.id) {
      if (this.fx.kind === 'dice') return atSquare(this.fx.fromId)
      const elapsed = Math.max(0, now - this.fx.startMs)
      const idx = Math.min(this.fx.path.length - 1, Math.floor(elapsed / this.fx.stepMs))
      const t = easeInOut(Math.min(1, (elapsed - idx * this.fx.stepMs) / this.fx.stepMs))
      const fromId = idx <= 0 ? this.fx.fromId : this.fx.path[idx - 1]
      const toId = this.fx.path[idx]
      const a = atSquare(fromId)
      const b = atSquare(toId)
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
    }
    return atSquare(player.position)
  }

  private draw(w: number, h: number, now: number): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx || !this.layout) return
    ctx.save()
    ctx.clearRect(0, 0, w, h)
    drawBackground(ctx, w, h)
    drawBoard(ctx, this.state, this.layout, (p) => this.pieceXY(p, this.layout!, now))
    drawHud(ctx, this.state, w, this.fx)
    drawHand(ctx, this.state, w, h, getSelectableCardIds(this.state))
    drawActionBar(
      ctx,
      this.state,
      w,
      h,
      this.fx.kind === 'dice' ? 'rolling' : this.fx.kind === 'walk' ? 'moving' : null
    )
    drawLog(ctx, this.state, w)
    drawDiceOverlay(ctx, this.state, this.fx, w, h, now)
    ctx.restore()
  }
}

function hitRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h
}

function computeLayout(w: number, h: number, config: GameConfig): Layout {
  if (config.layout && config.layout.length === config.board.length) {
    const marginX = w * 0.1
    const marginY = h * 0.1
    const bw = w - marginX * 2
    const bh = h * 0.52
    const byId = new Map(
      config.board.map((s, i) => [s.id, config.layout![i] ?? config.layout![s.id]])
    )
    const squarePositions = config.board.map((s) => {
      const p = byId.get(s.id) ?? { x: 0.5, y: 0.5 }
      return { x: marginX + p.x * bw, y: marginY + 36 + p.y * bh }
    })
    return { width: w, height: h, squarePositions }
  }
  const cx = w / 2
  const cy = h * 0.4
  const radiusX = Math.min(w, h) * 0.36
  const radiusY = Math.min(w, h) * 0.28
  return {
    width: w,
    height: h,
    squarePositions: loopLayoutPositions(config.board.length, cx, cy, radiusX, radiusY)
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

function squareFill(square: { squareType: string; terrain: string }): string {
  switch (square.squareType) {
    case 'warp':
      return '#4a3568'
    case 'temple':
      return '#6b5420'
    case 'fortune':
      return '#2a5a5a'
    default:
      return terrainColor(square.terrain)
  }
}

function posForId(
  layout: Layout,
  board: GameState['config']['board'],
  id: number
): { x: number; y: number } {
  const idx = board.findIndex((s) => s.id === id)
  return layout.squarePositions[idx >= 0 ? idx : id]
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: Layout,
  pieceXY: (player: Player) => { x: number; y: number }
): void {
  const { squarePositions } = layout
  const board = state.config.board
  const squareSize = Math.max(40, Math.min(layout.width, layout.height) * 0.07)
  const pathIds = new Set(
    state.phase === 'choose_path'
      ? getPathChoices(state)
      : state.phase === 'select_square'
        ? getMoveTargets(state)
        : []
  )

  const drawn = new Set<string>()
  for (const square of board) {
    const a = posForId(layout, board, square.id)
    for (const dest of square.exits) {
      const key = square.id < dest ? `${square.id}-${dest}` : `${dest}-${square.id}`
      if (drawn.has(key)) continue
      drawn.add(key)
      const b = posForId(layout, board, dest)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  for (let i = 0; i < board.length; i++) {
    const square = board[i]
    const pos = squarePositions[i]
    const territory = state.territories.find((t) => t.squareId === square.id)
    const ownerColor = territory ? PLAYER_COLORS[territory.ownerId] : null
    const highlight = pathIds.has(square.id)

    ctx.fillStyle = squareFill(square)
    ctx.strokeStyle = highlight ? '#e8c36a' : (ownerColor ?? 'rgba(255,255,255,0.25)')
    ctx.lineWidth = highlight ? 3 : ownerColor ? 3 : 1
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
    else if (square.squareType === 'warp') ctx.fillText('Warp', pos.x, pos.y)
    else if (square.squareType === 'temple') ctx.fillText('Temple', pos.x, pos.y)
    else if (square.squareType === 'fortune') ctx.fillText('Fortune', pos.x, pos.y)
    else if (territory) ctx.fillText(`L${territory.level}`, pos.x, pos.y)
    else ctx.fillText(square.terrain[0]!.toUpperCase(), pos.x, pos.y)
  }

  for (const player of state.players) {
    const pos = pieceXY(player)
    ctx.beginPath()
    ctx.fillStyle = player.color
    ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 9px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(player.name.slice(0, 1).toUpperCase(), pos.x, pos.y)
  }
}

function fxPhaseLabel(state: GameState, fx: Fx): string {
  const name = state.players[state.currentPlayerIndex]?.name ?? ''
  if (fx.kind === 'dice') return `${name} — rolling`
  if (fx.kind === 'walk') return `${name} — moving`
  return getPhaseLabel(state)
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number, fx: Fx): void {
  const panelH = 20 + state.players.length * 18
  ctx.fillStyle = 'rgba(12,16,22,0.88)'
  roundRect(ctx, 12, 12, w - 24, Math.max(78, panelH + 36), 10)
  ctx.fill()

  ctx.font = '12px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  state.players.forEach((p, i) => {
    ctx.fillStyle = p.color || PLAYER_COLORS[i] || '#ccc'
    const turn = i === state.currentPlayerIndex ? ' ›' : ''
    ctx.fillText(
      `${p.name}${p.isAi ? ' (AI)' : ''}: ${p.magic}G · ${totalMagic(state, p)}G${turn}`,
      24,
      22 + i * 18
    )
  })

  ctx.fillStyle = '#e8eaed'
  ctx.textAlign = 'center'
  ctx.font = '14px system-ui,sans-serif'
  ctx.fillText(`${state.config.mapName} — ${fxPhaseLabel(state, fx)}`, w / 2, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '12px system-ui,sans-serif'
  ctx.fillText(`Goal ${state.config.targetMagic}G · ${state.players.length}p`, w / 2, 46)

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
  h: number,
  motion: 'rolling' | 'moving' | null
): void {
  const y = h - 52
  if (motion) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '13px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(motion === 'rolling' ? 'Rolling…' : 'Moving…', w / 2, y + 20)
    return
  }
  const current = state.players[state.currentPlayerIndex]
  if (current?.isAi) {
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
  if (state.phase === 'choose_path') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '12px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Click a highlighted path', w / 2, y - 16)
    return
  }
  if (state.phase === 'select_square') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '12px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      state.pendingAction === 'exchange'
        ? 'Click a highlighted land to exchange'
        : 'Click a highlighted land to move',
      w / 2,
      y - 16
    )
    return
  }

  const labels: Record<LandedAction, string> = {
    place: 'Summon',
    battle: 'Invade',
    pay_toll: 'Pay toll',
    level_up: 'Level up',
    cast_spell: 'Spell',
    shrine: 'Pray',
    move_creature: 'Move',
    territory_ability: 'Ability',
    temple: 'Temple',
    fortune: 'Fortune',
    exchange: 'Exchange',
    transform: 'Transform',
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

function drawDiceOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  fx: Fx,
  w: number,
  h: number,
  now: number
): void {
  if (fx.kind === 'dice') {
    ctx.fillStyle = 'rgba(8, 10, 14, 0.28)'
    ctx.fillRect(0, 0, w, h)
    const rot = diceRotation(fx.spin, now)
    const size = Math.min(120, Math.min(w, h) * 0.18)
    drawDie(ctx, w / 2, h * 0.4, size, fx.spin.result, fx.spin.maxDie, rot)
    return
  }
  if (state.lastRoll == null || state.phase === 'roll') return
  drawDie(ctx, w / 2, 78, 36, state.lastRoll, state.config.maxDie, { x: -0.42, y: 0.58, z: 0.06 })
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
