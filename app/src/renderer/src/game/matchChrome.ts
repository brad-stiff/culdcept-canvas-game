import { totalMagic } from '../../../shared/game/economy'
import type { GameState } from '../../../shared/game/types'

export type MatchChromeEls = {
  root: HTMLElement | null
  left: HTMLElement | null
  phase: HTMLElement | null
  strip: HTMLElement | null
  log: HTMLElement | null
  menu: HTMLButtonElement | null
}

export type CepterChrome = {
  id: number
  name: string
  color: string
  magic: number
  total: number
  isAi: boolean
  isTurn: boolean
}

export type MatchChromeModel = {
  players: CepterChrome[]
  mapName: string
  phaseLabel: string
  goal: number
  log: string[]
}

export function matchChromeModel(state: GameState, phaseLabel: string): MatchChromeModel {
  return {
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      magic: p.magic,
      total: totalMagic(state, p),
      isAi: p.isAi,
      isTurn: i === state.currentPlayerIndex
    })),
    mapName: state.config.mapName,
    phaseLabel,
    goal: state.config.targetMagic,
    log: state.log.slice(-16)
  }
}

export function matchChromeKey(model: MatchChromeModel): string {
  const players = model.players
    .map((p) => `${p.id}:${p.magic}:${p.total}:${p.isTurn ? 1 : 0}`)
    .join('|')
  const log = model.log[model.log.length - 1] ?? ''
  return `${players}~${model.phaseLabel}~${model.log.length}~${log}`
}

export function showMatchChrome(els: MatchChromeEls): void {
  els.root?.classList.add('hud-match')
  if (els.left) els.left.hidden = false
  if (els.menu) els.menu.hidden = false
}

export function hideMatchChrome(els: MatchChromeEls): void {
  els.root?.classList.remove('hud-match')
  if (els.left) {
    els.left.hidden = true
    if (els.strip) els.strip.innerHTML = ''
    if (els.log) els.log.innerHTML = ''
    if (els.phase) els.phase.textContent = ''
  }
  if (els.menu) els.menu.hidden = true
}

export function renderMatchChrome(els: MatchChromeEls, model: MatchChromeModel): void {
  if (els.phase) {
    els.phase.innerHTML = `<span class="match-map">${escapeHtml(model.mapName)}</span>
      <span class="match-phase-label">${escapeHtml(model.phaseLabel)}</span>
      <span class="match-goal">Goal ${model.goal}G</span>`
  }
  if (els.strip) {
    els.strip.innerHTML = model.players
      .map(
        (
          p
        ) => `<li class="cepter${p.isTurn ? ' is-turn' : ''}" style="--cepter:${escapeHtml(p.color)}">
          <span class="cepter-swatch"></span>
          <span class="cepter-name">${escapeHtml(p.name)}${p.isAi ? ' (AI)' : ''}</span>
          <span class="cepter-magic">${p.magic}G · ${p.total}G</span>
        </li>`
      )
      .join('')
  }
  if (els.log) {
    els.log.innerHTML = model.log.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
    els.log.scrollTop = els.log.scrollHeight
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
