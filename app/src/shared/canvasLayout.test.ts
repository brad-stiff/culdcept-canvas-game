import { backingSizeForCssBox } from './canvasLayout'

describe('backingSizeForCssBox', () => {
  it('scales buffer by devicePixelRatio', () => {
    const size = backingSizeForCssBox(100, 50, 2)

    expect(size.cssWidth).toBe(100)
    expect(size.cssHeight).toBe(50)
    expect(size.bufferWidth).toBe(200)
    expect(size.bufferHeight).toBe(100)
  })

  it('falls back to 1 when dpr is invalid', () => {
    const size = backingSizeForCssBox(10, 10, 0)
    expect(size.bufferWidth).toBe(10)
    expect(size.bufferHeight).toBe(10)
  })
})
