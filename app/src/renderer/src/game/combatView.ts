import type { CombatViewModel } from '../../../shared/game/combat'
import type { MatchCard } from '../../../shared/game/types'
import { CardArtCache, drawImageCover } from './cardArtCache'

const CARD_W = 132
const CARD_H = 176

export function combatHpT(now: number, startMs: number, durationMs: number): number {
  const t = Math.min(1, Math.max(0, (now - startMs) / durationMs))
  return 1 - (1 - t) ** 3
}

export function drawCombatOverlay(
  ctx: CanvasRenderingContext2D,
  view: CombatViewModel,
  art: CardArtCache,
  w: number,
  h: number,
  hpT: number
): void {
  const top = 78
  const bottom = h - 168
  ctx.fillStyle = 'rgba(8, 10, 14, 0.62)'
  ctx.fillRect(0, top, w, Math.max(0, bottom - top))

  const cy = top + Math.max(120, (bottom - top) / 2)
  const gap = Math.min(220, w * 0.28)
  const left = w / 2 - gap / 2 - CARD_W
  const right = w / 2 + gap / 2

  ctx.fillStyle = 'rgba(232, 234, 237, 0.55)'
  ctx.font = '12px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${view.squareName} · L${view.landLevel}`, w / 2, cy - CARD_H / 2 - 28)

  ctx.fillStyle = '#e8c36a'
  ctx.font = 'bold 18px system-ui,sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', w / 2, cy - 8)

  const atkHp = Math.round(lerp(view.attackerHp, view.attackerRemainingHp, view.resolved ? hpT : 0))
  const defHp = Math.round(lerp(view.defenderHp, view.defenderRemainingHp, view.resolved ? hpT : 0))

  drawFighter(
    ctx,
    art,
    left,
    cy - CARD_H / 2,
    view.attacker,
    view.attackerSt,
    atkHp,
    view.attackerHp,
    'Invader'
  )
  drawFighter(
    ctx,
    art,
    right,
    cy - CARD_H / 2,
    view.defender,
    view.defenderSt,
    defHp,
    view.defenderHp,
    'Defender'
  )

  if (view.item) {
    drawItemChip(ctx, art, left + CARD_W - 40, cy + CARD_H / 2 - 58, view.item, view.itemEffective)
  }

  if (view.resolved && view.message) {
    ctx.fillStyle = '#e8eaed'
    ctx.font = '13px system-ui,sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const result = view.attackerWins ? 'Invasion succeeds' : 'Land holds'
    ctx.fillText(result, w / 2, cy + CARD_H / 2 + 18)
    ctx.fillStyle = 'rgba(232, 234, 237, 0.7)'
    ctx.font = '12px system-ui,sans-serif'
    wrapText(ctx, view.message, w / 2, cy + CARD_H / 2 + 38, Math.min(520, w - 80), 16)
  }
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  art: CardArtCache,
  x: number,
  y: number,
  card: MatchCard,
  st: number,
  hp: number,
  hpMax: number,
  role: string
): void {
  ctx.fillStyle = 'rgba(232, 234, 237, 0.5)'
  ctx.font = '11px system-ui,sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(role, x + CARD_W / 2, y - 6)

  ctx.save()
  roundRect(ctx, x, y, CARD_W, CARD_H, 10)
  ctx.clip()
  ctx.fillStyle = '#1a1f28'
  ctx.fillRect(x, y, CARD_W, CARD_H)
  const img = art.get(card.catalogId, card.name)
  if (img) drawImageCover(ctx, img, x, y, CARD_W, CARD_H)
  ctx.fillStyle = 'rgba(8,10,14,0.78)'
  ctx.fillRect(x, y + CARD_H - 46, CARD_W, 46)
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, CARD_W, CARD_H, 10)
  ctx.stroke()

  ctx.fillStyle = '#e8eaed'
  ctx.font = 'bold 12px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(card.name.slice(0, 16), x + 8, y + CARD_H - 40)
  ctx.font = '11px system-ui,sans-serif'
  ctx.fillStyle = 'rgba(232, 234, 237, 0.8)'
  ctx.fillText(`ST ${st}`, x + 8, y + CARD_H - 24)

  drawHpBar(ctx, x + 8, y + CARD_H - 10, CARD_W - 16, hp, hpMax)
}

function drawItemChip(
  ctx: CanvasRenderingContext2D,
  art: CardArtCache,
  x: number,
  y: number,
  item: MatchCard,
  effective: boolean
): void {
  const w = 48
  const h = 64
  ctx.save()
  ctx.globalAlpha = effective ? 1 : 0.45
  roundRect(ctx, x, y, w, h, 6)
  ctx.clip()
  ctx.fillStyle = '#1a1f28'
  ctx.fillRect(x, y, w, h)
  const img = art.get(item.catalogId, item.name)
  if (img) drawImageCover(ctx, img, x, y, w, h)
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  roundRect(ctx, x, y, w, h, 6)
  ctx.stroke()
  ctx.fillStyle = 'rgba(232, 234, 237, 0.7)'
  ctx.font = '9px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(effective ? item.name.slice(0, 12) : 'Neutralized', x, y + h + 4)
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  hp: number,
  max: number
): void {
  const h = 6
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  roundRect(ctx, x, y, w, h, 3)
  ctx.fill()
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, hp / max))
  if (ratio > 0) {
    ctx.fillStyle = ratio > 0.4 ? '#3d8f62' : '#a84b3d'
    roundRect(ctx, x, y, Math.max(4, w * ratio), h, 3)
    ctx.fill()
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineH: number
): void {
  const words = text.split(' ')
  let line = ''
  let row = 0
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, cx, y + row * lineH)
      line = word
      row += 1
      if (row > 2) break
    } else {
      line = next
    }
  }
  if (line && row <= 2) ctx.fillText(line, cx, y + row * lineH)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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
