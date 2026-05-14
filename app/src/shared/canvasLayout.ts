export type CanvasBackingSize = {
  cssWidth: number
  cssHeight: number
  bufferWidth: number
  bufferHeight: number
}

/**
 * HiDPI backing-store size for a CSS-sized canvas box.
 */
export function backingSizeForCssBox(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): CanvasBackingSize {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return {
    cssWidth,
    cssHeight,
    bufferWidth: Math.max(1, Math.round(cssWidth * dpr)),
    bufferHeight: Math.max(1, Math.round(cssHeight * dpr))
  }
}
