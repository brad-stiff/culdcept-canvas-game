import { getCardById } from '../../../shared/cards/catalog'
import { resolveCardArtUrl } from '../ui/cardArt'
import type { InspectTarget } from './matchLayout'

let renderToken = 0

export function renderInspectPanel(el: HTMLElement | null, target: InspectTarget | null): void {
  if (!el) return
  const token = ++renderToken
  if (!target) {
    el.hidden = true
    el.innerHTML = ''
    return
  }

  const card = target.kind === 'hand' ? target.card : target.territory.creature
  const catalog = getCardById(card.catalogId)
  const element =
    card.element ?? (card.kind === 'item' ? 'item' : card.kind === 'spell' ? 'spell' : 'neutral')
  const stats =
    card.kind === 'creature'
      ? `ST ${card.st} / HP ${card.hp} / MHP ${card.mhp} · ${card.cost}G`
      : `${card.cost}G`
  const landLine =
    target.kind === 'land'
      ? `<p class="inspect-meta">${escapeHtml(target.square.name)} · L${target.territory.level}${
          target.territory.tollHalved ? ' · toll halved' : ''
        }</p>`
      : ''

  el.hidden = false
  el.innerHTML = `
    <img class="inspect-art" alt="" />
    <div class="inspect-body">
      <h2>${escapeHtml(card.name)}</h2>
      <p class="inspect-meta">${escapeHtml(card.kind)} · ${escapeHtml(String(element))}</p>
      <p class="inspect-meta">${escapeHtml(stats)}</p>
      ${landLine}
      <p class="inspect-ability">${escapeHtml(card.abilityText || catalog?.abilityText || '—')}</p>
    </div>
  `

  void resolveCardArtUrl(card.catalogId, card.name).then((url) => {
    if (token !== renderToken) return
    const img = el.querySelector('img')
    if (img) img.src = url
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
