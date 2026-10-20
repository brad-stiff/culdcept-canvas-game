import { cardArtCandidates, placeholderCardArtDataUrl } from '../../../shared/assets/paths'

/** Resolve a card art URL; falls back to SVG placeholder if files are missing. */
export function resolveCardArtUrl(cardId: string, label: string): Promise<string> {
  const candidates = cardArtCandidates(cardId).map((p) => `./${p}`)

  return new Promise((resolve) => {
    let i = 0
    const tryNext = (): void => {
      if (i >= candidates.length) {
        resolve(placeholderCardArtDataUrl(label))
        return
      }
      const url = candidates[i++]
      const img = new Image()
      img.onload = () => resolve(url)
      img.onerror = () => tryNext()
      img.src = url
    }
    tryNext()
  })
}
