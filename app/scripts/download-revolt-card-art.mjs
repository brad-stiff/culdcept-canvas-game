#!/usr/bin/env node
/**
 * Downloads Culdcept Revolt card art from Culdcept Central's complete card list
 * into the renderer public assets folder (personal / at-home use only).
 *
 * Source page embeds full-size images under /images/cards/cr3ds/{folder}/{file}.jpg
 * Saved as revolt-{slug}.jpg so they never overwrite Saga art.
 *
 * Usage:
 *   node scripts/download-revolt-card-art.mjs
 *   node scripts/download-revolt-card-art.mjs --force
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const catalogPath = join(root, 'src/shared/cards/revoltCatalog.json')
const outDir = join(root, 'src/renderer/public/assets/cards')
const LIST_URL =
  'https://www.culdceptcentral.com/culdcept-revolt/culdcept-revolt-card-lists/culdcept-revolt-complete-card-list'
const ORIGIN = 'https://www.culdceptcentral.com'

const force = process.argv.includes('--force')
const concurrency = 6

function normalizeKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'culdcept-canvas-game/0.0.1 (personal offline art mirror)',
      Accept: 'text/html,application/xhtml+xml'
    }
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'culdcept-canvas-game/0.0.1 (personal offline art mirror)',
      Accept: 'image/jpeg,image/*'
    }
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function extractCardImagePaths(html) {
  const re = /href="(\/images\/cards\/cr3ds\/[^"]+\.jpg)"/gi
  const paths = new Set()
  let m
  while ((m = re.exec(html)) !== null) {
    paths.add(m[1])
  }
  return [...paths]
}

async function mapPool(items, limit, worker) {
  const results = []
  let i = 0
  async function run() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await worker(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
  return results
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  /** @type {Map<string, string>} */
  const byKey = new Map()
  for (const card of catalog.cards) {
    byKey.set(normalizeKey(card.name), card.id)
    byKey.set(normalizeKey(card.id), card.id)
    if (card.id.startsWith('revolt-')) {
      byKey.set(normalizeKey(card.id.slice('revolt-'.length)), card.id)
    }
  }

  console.log(`Fetching Revolt card list HTML from ${LIST_URL}`)
  const html = await fetchText(LIST_URL)
  const paths = extractCardImagePaths(html)
  console.log(`Found ${paths.length} full-size Revolt card images`)

  const jobs = []
  const unmatched = []
  for (const path of paths) {
    const file = path.split('/').pop() ?? ''
    const base = file.replace(/\.jpg$/i, '')
    const id = byKey.get(normalizeKey(base))
    if (!id) {
      unmatched.push(path)
      continue
    }
    jobs.push({ path, id, url: `${ORIGIN}${path}`, dest: join(outDir, `${id}.jpg`) })
  }

  console.log(`Matched ${jobs.length} images to catalog ids (${unmatched.length} unmatched)`)
  if (unmatched.length) {
    console.log('Unmatched samples:', unmatched.slice(0, 10).join(', '))
  }

  let downloaded = 0
  let skipped = 0
  let failed = 0

  await mapPool(jobs, concurrency, async (job) => {
    if (!force && existsSync(job.dest)) {
      skipped++
      return
    }
    try {
      const buf = await fetchBinary(job.url)
      writeFileSync(job.dest, buf)
      downloaded++
      if (downloaded % 25 === 0) {
        console.log(`… downloaded ${downloaded}/${jobs.length}`)
      }
    } catch (err) {
      failed++
      console.warn(`Failed ${job.url}:`, err instanceof Error ? err.message : err)
    }
  })

  const manifest = {
    sourceUrl: LIST_URL,
    downloadedAt: new Date().toISOString(),
    matched: jobs.length,
    downloaded,
    skipped,
    failed,
    unmatched: unmatched.length
  }
  writeFileSync(join(outDir, 'download-manifest-revolt.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(
    `Done (Revolt). downloaded=${downloaded} skipped=${skipped} failed=${failed} → ${outDir}`
  )
  console.log('Personal use only — card art is not redistributed with the repo (.gitignore).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
