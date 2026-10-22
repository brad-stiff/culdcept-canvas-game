import { cardArtCandidates, placeholderCardArtDataUrl } from '../../../shared/assets/paths'

const loaded = new Map<string, HTMLImageElement>()
const inflight = new Map<string, Promise<HTMLImageElement>>()

export type ArtCard = { catalogId: string; name: string }

/** Session-wide decoded card art for canvas `drawImage`. */
export class CardArtCache {
  constructor(private onChange: () => void) {}

  get(catalogId: string, label = catalogId): HTMLImageElement | null {
    const hit = loaded.get(catalogId)
    if (hit) return hit
    void this.ensure(catalogId, label)
    return null
  }

  preload(cards: ArtCard[]): void {
    for (const card of cards) void this.ensure(card.catalogId, card.name)
  }

  dispose(): void {
    this.onChange = () => {}
  }

  private ensure(catalogId: string, label: string): Promise<HTMLImageElement> {
    const existing = loaded.get(catalogId)
    if (existing) return Promise.resolve(existing)
    const pending = inflight.get(catalogId)
    if (pending) return pending
    const work = loadCardImage(catalogId, label).then((img) => {
      loaded.set(catalogId, img)
      inflight.delete(catalogId)
      this.onChange()
      return img
    })
    inflight.set(catalogId, work)
    return work
  }
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (iw <= 0 || ih <= 0 || w <= 0 || h <= 0) return
  const ir = iw / ih
  const r = w / h
  let sx = 0
  let sy = 0
  let sw = iw
  let sh = ih
  if (ir > r) {
    sw = ih * r
    sx = (iw - sw) / 2
  } else {
    sh = iw / r
    sy = (ih - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function loadCardImage(catalogId: string, label: string): Promise<HTMLImageElement> {
  const urls = cardArtCandidates(catalogId).map((p) => `./${p}`)
  return tryUrls(urls).then((img) => img ?? loadUrl(placeholderCardArtDataUrl(label)))
}

function tryUrls(urls: string[]): Promise<HTMLImageElement | null> {
  return urls.reduce<Promise<HTMLImageElement | null>>(
    (prev, url) => prev.then((hit) => hit ?? loadUrl(url).catch(() => null)),
    Promise.resolve(null)
  )
}

function loadUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`art ${url}`))
    img.src = url
  })
}
