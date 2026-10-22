import { squareById } from '../../../shared/game/board'
import { chooseAiAction } from '../../../shared/game/ai'
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
import { combatViewFromState } from '../../../shared/game/combat'
import { CardArtCache, drawImageCover } from './cardArtCache'
import { combatHpT, drawCombatOverlay } from './combatView'
import { createDiceSpin, diceProgress, diceRotation, drawDie, type DiceSpin } from './dice'
import { renderInspectPanel } from './inspectPanel'
import {
  type MatchChromeEls,
  hideMatchChrome,
  matchChromeKey,
  matchChromeModel,
  renderMatchChrome,
  showMatchChrome
} from './matchChrome'
import {
  type BoardLayout,
  type InspectTarget,
  hitRect,
  inspectKey,
  inspectTargetAt,
  squareHitSize,
  squarePosition,
  handLayout
} from './matchLayout'
import { easeInOut, lerp, movementPlan } from './motion'

type Layout = BoardLayout

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
  | {
      kind: 'combat'
      startMs: number
      durationMs: number
    }

const WALK_STEP_MS = 200
const COMBAT_MS = 920

export type GameViewOptions = {
  seats?: MatchSeat[]
  /** When set, only this player may act locally (LAN client / host seat). */
  localPlayerId?: number | null
  /** Host-authoritative remote: push actions outward instead of reducing locally. */
  onLocalAction?: (action: GameAction) => void
  /** If false, do not run local AI (LAN clients). Default true. */
  runAi?: boolean
  initialState?: GameState
  inspectEl?: HTMLElement | null
  chromeEls?: MatchChromeEls
}

export class GameView {
  private state: GameState
  private layout: Layout | null = null
  private onExit: () => void
  private boundClick: (e: MouseEvent) => void
  private boundKey: (e: KeyboardEvent) => void
  private boundMove: (e: MouseEvent) => void
  private boundLeave: (e: MouseEvent) => void
  private boundInspectLeave: (e: MouseEvent) => void
  private aiTimer: number | null = null
  private raf: number | null = null
  private fx: Fx = { kind: 'idle' }
  private localPlayerId: number | null
  private onLocalAction: ((action: GameAction) => void) | null
  private runAiFlag: boolean
  private inspectEl: HTMLElement | null
  private chromeEls: MatchChromeEls
  private chromeKey = ''
  private boundMenu: () => void
  private art: CardArtCache
  private hover: InspectTarget | null = null
  private pinned: InspectTarget | null = null

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
    this.inspectEl =
      opts.inspectEl !== undefined ? opts.inspectEl : document.getElementById('inspect-card')
    this.chromeEls = opts.chromeEls ?? queryMatchChrome()
    this.art = new CardArtCache(() => this.drawNow())
    this.onExit = onExit
    this.boundClick = (e) => this.handleClick(e)
    this.boundKey = (e) => this.handleKey(e)
    this.boundMove = (e) => this.handleMove(e)
    this.boundLeave = (e) => this.handleLeave(e)
    this.boundInspectLeave = (e) => this.handleLeave(e)
    this.boundMenu = () => this.onExit()
    this.canvas.addEventListener('click', this.boundClick)
    this.canvas.addEventListener('mousemove', this.boundMove)
    this.canvas.addEventListener('mouseleave', this.boundLeave)
    this.inspectEl?.addEventListener('mouseleave', this.boundInspectLeave)
    this.chromeEls.menu?.addEventListener('click', this.boundMenu)
    window.addEventListener('keydown', this.boundKey)
    showMatchChrome(this.chromeEls)
    this.preloadArt()
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
    this.canvas.removeEventListener('mousemove', this.boundMove)
    this.canvas.removeEventListener('mouseleave', this.boundLeave)
    this.inspectEl?.removeEventListener('mouseleave', this.boundInspectLeave)
    this.chromeEls.menu?.removeEventListener('click', this.boundMenu)
    window.removeEventListener('keydown', this.boundKey)
    if (this.aiTimer !== null) window.clearTimeout(this.aiTimer)
    if (this.raf !== null) window.cancelAnimationFrame(this.raf)
    this.fx = { kind: 'idle' }
    this.art.dispose()
    renderInspectPanel(this.inspectEl, null)
    hideMatchChrome(this.chromeEls)
    this.chromeKey = ''
    this.canvas.style.cursor = ''
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.layout = computeLayout(cssWidth, cssHeight, this.state.config)
    this.draw(cssWidth, cssHeight, performance.now())
  }

  private canControlCurrent(): boolean {
    if (this.fx.kind === 'dice' || this.fx.kind === 'walk') return false
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
    this.preloadArt()
    this.refreshInspectTargets()
    const now = performance.now()
    if (next.phase === 'battle_result' && prev.phase !== 'battle_result' && next.lastBattle) {
      this.fx = { kind: 'combat', startMs: now, durationMs: COMBAT_MS }
      this.startLoop()
      return
    }
    const plan = movementPlan(prev, next)
    if (!plan) {
      this.fx = { kind: 'idle' }
      this.drawNow()
      this.queueAi()
      return
    }
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
      return
    }
    if (this.fx.kind === 'combat') {
      if (now - this.fx.startMs >= this.fx.durationMs) this.fx = { kind: 'idle' }
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

  private preloadArt(): void {
    const cards = [
      ...this.state.players.flatMap((p) => p.hand),
      ...this.state.territories.map((t) => t.creature)
    ]
    const battle = this.state.lastBattle
    if (battle?.attacker) cards.push(battle.attacker, battle.defender)
    if (battle?.item) cards.push(battle.item)
    this.art.preload(cards)
  }

  private syncInspect(): void {
    renderInspectPanel(this.inspectEl, this.hover ?? this.pinned)
  }

  private refreshInspectTargets(): void {
    this.hover = this.rebindInspect(this.hover)
    this.pinned = this.rebindInspect(this.pinned)
    this.syncInspect()
  }

  private rebindInspect(target: InspectTarget | null): InspectTarget | null {
    if (!target) return null
    if (target.kind === 'hand') {
      const player = this.state.players[this.state.currentPlayerIndex]
      const card = player?.hand.find((c) => c.instanceId === target.card.instanceId)
      return card ? { kind: 'hand', card } : null
    }
    const terr = this.state.territories.find((t) => t.squareId === target.territory.squareId)
    if (!terr) return null
    return {
      kind: 'land',
      territory: terr,
      square: squareById(this.state.config.board, terr.squareId)
    }
  }

  private pointerOnCanvas(e: MouseEvent): { x: number; y: number; w: number; h: number } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: rect.width,
      h: rect.height
    }
  }

  private inspectAt(w: number, h: number, x: number, y: number): InspectTarget | null {
    const target = inspectTargetAt(this.state, this.layout, w, h, x, y)
    if (
      target?.kind === 'land' &&
      (this.state.phase === 'select_item' || this.state.phase === 'battle_result')
    ) {
      return null
    }
    return target
  }

  private handleMove(e: MouseEvent): void {
    const { x, y, w, h } = this.pointerOnCanvas(e)
    const next = this.inspectAt(w, h, x, y)
    if (inspectKey(next) === inspectKey(this.hover)) return
    this.hover = next
    this.canvas.style.cursor = next ? 'pointer' : ''
    this.syncInspect()
    if (this.fx.kind === 'idle') this.drawNow()
  }

  private handleLeave(e: MouseEvent): void {
    const next = e.relatedTarget
    if (next instanceof Node && (this.canvas.contains(next) || this.inspectEl?.contains(next))) {
      return
    }
    if (!this.hover) return
    this.hover = null
    this.canvas.style.cursor = ''
    this.syncInspect()
    if (this.fx.kind === 'idle') this.drawNow()
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
    const { x, y, w, h } = this.pointerOnCanvas(e)

    const inspect = this.inspectAt(w, h, x, y)
    this.pinned = inspect
    this.syncInspect()
    if (this.fx.kind === 'idle') this.drawNow()

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
      const squareSize = squareHitSize(this.layout)
      for (const id of pathIds) {
        const pos = squarePosition(this.layout, this.state.config.board, id)
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
    const layout = handLayout(hand.length, w, h)
    for (let hi = 0; hi < hand.length; hi++) {
      const card = hand[hi]
      const cx = layout.startX + hi * (layout.cardW + layout.gap)
      if (hitRect(x, y, cx, layout.y, layout.cardW, layout.cardH)) {
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
    const squareSize = squareHitSize(layout)
    const offset = player.id === 0 ? -12 : player.id === 1 ? 12 : player.id === 2 ? -22 : 22
    const atSquare = (id: number): { x: number; y: number } => {
      const p = squarePosition(layout, board, id)
      return { x: p.x + offset, y: p.y + squareSize / 2 + 10 }
    }
    if ((this.fx.kind === 'dice' || this.fx.kind === 'walk') && this.fx.playerId === player.id) {
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
    const hoverKey = inspectKey(this.hover ?? this.pinned)
    drawBoard(
      ctx,
      this.state,
      this.layout,
      (p) => this.pieceXY(p, this.layout!, now),
      this.art,
      hoverKey
    )
    this.syncChrome()
    const selectable = getSelectableCardIds(this.state)
    const previewItem =
      this.state.phase === 'select_item' &&
      this.hover?.kind === 'hand' &&
      selectable.includes(this.hover.card.instanceId)
        ? this.hover.card
        : null
    const combat = combatViewFromState(this.state, previewItem)
    const hpT = this.fx.kind === 'combat' ? combatHpT(now, this.fx.startMs, this.fx.durationMs) : 1
    if (combat) drawCombatOverlay(ctx, combat, this.art, w, h, hpT)
    drawHand(ctx, this.state, w, h, selectable, this.art, hoverKey)
    drawActionBar(
      ctx,
      this.state,
      w,
      h,
      this.fx.kind === 'dice' ? 'rolling' : this.fx.kind === 'walk' ? 'moving' : null
    )
    drawDiceOverlay(ctx, this.state, this.fx, w, h, now)
    drawGameOver(ctx, this.state, w, h)
    ctx.restore()
  }

  private syncChrome(): void {
    const model = matchChromeModel(this.state, fxPhaseLabel(this.state, this.fx))
    const key = matchChromeKey(model)
    if (key === this.chromeKey) return
    this.chromeKey = key
    renderMatchChrome(this.chromeEls, model)
  }
}

function queryMatchChrome(): MatchChromeEls {
  const menu = document.getElementById('btn-match-menu')
  return {
    root: document.getElementById('hud'),
    left: document.getElementById('match-left'),
    phase: document.getElementById('match-phase'),
    strip: document.getElementById('cepter-strip'),
    log: document.getElementById('match-log'),
    menu: menu instanceof HTMLButtonElement ? menu : null
  }
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

function drawBoard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: Layout,
  pieceXY: (player: Player) => { x: number; y: number },
  art: CardArtCache,
  hoverKey: string
): void {
  const { squarePositions } = layout
  const board = state.config.board
  const squareSize = squareHitSize(layout)
  const pathIds = new Set(
    state.phase === 'choose_path'
      ? getPathChoices(state)
      : state.phase === 'select_square'
        ? getMoveTargets(state)
        : []
  )

  const drawn = new Set<string>()
  for (const square of board) {
    const a = squarePosition(layout, board, square.id)
    for (const dest of square.exits) {
      const key = square.id < dest ? `${square.id}-${dest}` : `${dest}-${square.id}`
      if (drawn.has(key)) continue
      drawn.add(key)
      const b = squarePosition(layout, board, dest)
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
    const hovered = hoverKey === `land:${square.id}`
    const highlight = pathIds.has(square.id) || hovered
    const x = pos.x - squareSize / 2
    const y = pos.y - squareSize / 2

    ctx.save()
    roundRect(ctx, x, y, squareSize, squareSize, 6)
    ctx.clip()
    ctx.fillStyle = squareFill(square)
    ctx.fillRect(x, y, squareSize, squareSize)
    if (territory) {
      const img = art.get(territory.creature.catalogId, territory.creature.name)
      if (img) drawImageCover(ctx, img, x, y, squareSize, squareSize)
    }
    ctx.restore()

    ctx.strokeStyle = highlight ? '#e8c36a' : (ownerColor ?? 'rgba(255,255,255,0.25)')
    ctx.lineWidth = highlight ? 3 : ownerColor ? 3 : 1
    roundRect(ctx, x, y, squareSize, squareSize, 6)
    ctx.stroke()

    ctx.fillStyle = '#e8eaed'
    ctx.font = '10px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (territory) {
      const badgeW = 22
      const badgeH = 13
      ctx.fillStyle = 'rgba(8,10,14,0.72)'
      roundRect(ctx, pos.x - badgeW / 2, pos.y + squareSize / 2 - badgeH - 3, badgeW, badgeH, 3)
      ctx.fill()
      ctx.fillStyle = '#e8eaed'
      ctx.font = 'bold 9px system-ui,sans-serif'
      ctx.fillText(`L${territory.level}`, pos.x, pos.y + squareSize / 2 - badgeH / 2 - 3)
    } else if (square.squareType === 'castle') ctx.fillText('Castle', pos.x, pos.y)
    else if (square.squareType === 'fort') ctx.fillText('Fort', pos.x, pos.y)
    else if (square.squareType === 'shrine') ctx.fillText('Shrine', pos.x, pos.y)
    else if (square.squareType === 'warp') ctx.fillText('Warp', pos.x, pos.y)
    else if (square.squareType === 'temple') ctx.fillText('Temple', pos.x, pos.y)
    else if (square.squareType === 'fortune') ctx.fillText('Fortune', pos.x, pos.y)
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
  if (fx.kind === 'combat' || state.phase === 'battle_result' || state.phase === 'select_item') {
    return `${name} — battle`
  }
  return getPhaseLabel(state)
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
  selectable: string[],
  art: CardArtCache,
  hoverKey: string
): void {
  const player = state.players[state.currentPlayerIndex]
  const layout = handLayout(player.hand.length, w, h)

  for (let i = 0; i < player.hand.length; i++) {
    const card = player.hand[i]
    const x = layout.startX + i * (layout.cardW + layout.gap)
    const y = layout.y
    const active = selectable.includes(card.instanceId)
    const hovered = hoverKey === `hand:${card.instanceId}`
    const img = art.get(card.catalogId, card.name)

    ctx.save()
    roundRect(ctx, x, y, layout.cardW, layout.cardH, 8)
    ctx.clip()
    ctx.fillStyle = active ? '#2a3548' : '#1a1f28'
    ctx.fillRect(x, y, layout.cardW, layout.cardH)
    if (img) drawImageCover(ctx, img, x, y, layout.cardW, layout.cardH)
    ctx.fillStyle = 'rgba(8,10,14,0.78)'
    ctx.fillRect(x, y + layout.cardH - 34, layout.cardW, 34)
    ctx.restore()

    ctx.strokeStyle = hovered ? '#e8c36a' : active ? '#7eb6e8' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = hovered || active ? 2 : 1
    roundRect(ctx, x, y, layout.cardW, layout.cardH, 8)
    ctx.stroke()

    ctx.fillStyle = '#e8eaed'
    ctx.font = 'bold 10px system-ui,sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(card.name.slice(0, 11), x + 6, y + layout.cardH - 30)
    ctx.font = '9px system-ui,sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    const line =
      card.kind === 'creature' ? `ST ${card.st} / HP ${card.hp}` : `${card.kind} · ${card.cost}G`
    ctx.fillText(line, x + 6, y + layout.cardH - 16)
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
  drawDie(ctx, w / 2, 48, 36, state.lastRoll, state.config.maxDie, { x: -0.42, y: 0.58, z: 0.06 })
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  if (state.phase === 'game_over' && state.winnerId !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 26px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${state.players[state.winnerId].name} wins!`, w / 2, h / 2 - 16)
    ctx.font = '15px system-ui,sans-serif'
    ctx.fillText('Press Esc for menu', w / 2, h / 2 + 18)
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
