/**
 * Local personal-use asset conventions.
 *
 * Drop files under `app/assets/` (see READMEs there). The renderer resolves
 * paths relative to the packaged/asar public assets root.
 */

export type CardArtFormat = 'png' | 'webp' | 'jpg'

const CARD_EXTENSIONS: CardArtFormat[] = ['png', 'webp', 'jpg']

/** Relative path candidates for a card's art, in lookup order. */
export function cardArtCandidates(cardId: string): string[] {
  return CARD_EXTENSIONS.map((ext) => `assets/cards/${cardId}.${ext}`)
}

/** Relative path candidates for a board tile. */
export function tileArtCandidates(tileId: string): string[] {
  return CARD_EXTENSIONS.map((ext) => `assets/tiles/${tileId}.${ext}`)
}

export function placeholderCardArtDataUrl(label: string): string {
  const safe = label.replace(/[<>&'"]/g, '').slice(0, 24)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220">
  <rect width="100%" height="100%" fill="#1a2230"/>
  <rect x="8" y="8" width="144" height="204" fill="none" stroke="#3a4660" stroke-width="2"/>
  <text x="80" y="112" text-anchor="middle" fill="#8b95a8" font-family="system-ui,sans-serif" font-size="12">${safe}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
