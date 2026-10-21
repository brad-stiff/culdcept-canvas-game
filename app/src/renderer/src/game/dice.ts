const TAU = Math.PI * 2

export type Vec3 = { x: number; y: number; z: number }

export type DiceSpin = {
  result: number
  maxDie: number
  startMs: number
  durationMs: number
  rest: Vec3
  turns: Vec3
}

const REST: Vec3 = { x: -0.42, y: 0.58, z: 0.06 }

export function createDiceSpin(result: number, maxDie: number, now: number): DiceSpin {
  return {
    result,
    maxDie: Math.max(2, maxDie),
    startMs: now,
    durationMs: 880,
    rest: REST,
    turns: {
      x: 2.15 + Math.random() * 1.4,
      y: 2.8 + Math.random() * 1.6,
      z: 0.35 + Math.random() * 0.5
    }
  }
}

export function diceProgress(spin: DiceSpin, now: number): number {
  return Math.min(1, Math.max(0, (now - spin.startMs) / spin.durationMs))
}

export function diceRotation(spin: DiceSpin, now: number): Vec3 {
  const p = easeOutCubic(diceProgress(spin, now))
  const remain = 1 - p
  return {
    x: spin.rest.x + TAU * spin.turns.x * remain,
    y: spin.rest.y + TAU * spin.turns.y * remain,
    z: spin.rest.z + TAU * spin.turns.z * remain
  }
}

export function drawDie(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  value: number,
  maxDie: number,
  rot: Vec3,
  alpha = 1
): void {
  const faces = projectFaces(rot, size, value, maxDie)
  faces.sort((a, b) => a.depth - b.depth)
  ctx.save()
  ctx.globalAlpha = alpha
  for (const face of faces) {
    if (face.depth < 0.05) continue
    ctx.beginPath()
    face.pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(cx + p.x, cy + p.y)
      else ctx.lineTo(cx + p.x, cy + p.y)
    })
    ctx.closePath()
    ctx.fillStyle = faceFill(face.light)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40, 36, 30, 0.45)'
    ctx.lineWidth = Math.max(1, size * 0.03)
    ctx.stroke()
    drawFaceValue(ctx, cx, cy, face, size)
  }
  ctx.restore()
}

type Face = {
  pts: { x: number; y: number }[]
  depth: number
  light: number
  value: number
  centroid: { x: number; y: number }
}

function projectFaces(rot: Vec3, size: number, result: number, maxDie: number): Face[] {
  const nums = faceNumbers(result, maxDie)
  const verts: Vec3[] = [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: -1, y: 1, z: 1 }
  ].map((v) => rotate(v, rot))

  const indexFaces: { idx: number[]; value: number }[] = [
    { idx: [4, 5, 6, 7], value: nums.front },
    { idx: [1, 0, 3, 2], value: nums.back },
    { idx: [5, 1, 2, 6], value: nums.right },
    { idx: [0, 4, 7, 3], value: nums.left },
    { idx: [7, 6, 2, 3], value: nums.top },
    { idx: [0, 1, 5, 4], value: nums.bottom }
  ]

  const light = normalize({ x: -0.35, y: -0.7, z: 1 })
  const fl = 3.6
  const scale = size * 0.42

  return indexFaces.map((f) => {
    const vs = f.idx.map((i) => verts[i])
    const a = vs[0]
    const b = vs[1]
    const c = vs[2]
    const n = normal(a, b, c)
    const pts = vs.map((v) => {
      const s = fl / (fl - v.z)
      return { x: v.x * scale * s, y: v.y * scale * s }
    })
    const centroid3 = {
      x: (a.x + b.x + c.x + vs[3].x) / 4,
      y: (a.y + b.y + c.y + vs[3].y) / 4,
      z: (a.z + b.z + c.z + vs[3].z) / 4
    }
    const s = fl / (fl - centroid3.z)
    return {
      pts,
      depth: centroid3.z,
      light: Math.max(0, dot(n, light)),
      value: f.value,
      centroid: { x: centroid3.x * scale * s, y: centroid3.y * scale * s }
    }
  })
}

function drawFaceValue(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  face: Face,
  size: number
): void {
  if (face.depth < 0.15) return
  ctx.fillStyle = `rgba(40, 32, 24, ${0.55 + face.light * 0.45})`
  ctx.font = `bold ${Math.max(11, Math.round(size * 0.38))}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(face.value), cx + face.centroid.x, cy + face.centroid.y)
}

function faceNumbers(
  result: number,
  maxDie: number
): {
  front: number
  back: number
  right: number
  left: number
  top: number
  bottom: number
} {
  const pool: number[] = []
  for (let n = 1; n <= maxDie; n++) {
    if (n !== result) pool.push(n)
  }
  while (pool.length < 5) pool.push(((result + pool.length) % maxDie) + 1)
  return {
    front: result,
    back: pool[0],
    right: pool[1],
    left: pool[2],
    top: pool[3],
    bottom: pool[4]
  }
}

function faceFill(light: number): string {
  const t = 0.62 + light * 0.32
  const r = Math.round(232 * t)
  const g = Math.round(224 * t)
  const b = Math.round(204 * t)
  return `rgb(${r},${g},${b})`
}

function rotate(v: Vec3, rot: Vec3): Vec3 {
  let p = v
  p = rotX(p, rot.x)
  p = rotY(p, rot.y)
  p = rotZ(p, rot.z)
  return p
}

function rotX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c }
}

function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }
}

function rotZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z }
}

function normal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return normalize({
    x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
    y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
    z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  })
}

function normalize(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / m, y: v.y / m, z: v.z / m }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}
