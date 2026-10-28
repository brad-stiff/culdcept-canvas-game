#!/usr/bin/env node
/**
 * Parses the Culdcept Central PS2/DC complete card list (markdown export)
 * into a JSON catalog of cards whose names are not already in Saga or the
 * Revolt extras set. Ids are prefixed ps2-. Medal/Extra cards are omitted.
 *
 * Ability text that says "maximum of 80" is retuned to 100 to match Saga.
 *
 * Usage: node scripts/parse-ps2-card-list.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcePath = join(root, 'data/sources/culdcept-ps2dc-complete-card-list.md')
const sagaCatalogPath = join(root, 'src/shared/cards/sagaCatalog.json')
const revoltCatalogPath = join(root, 'src/shared/cards/revoltCatalog.json')
const outPath = join(root, 'src/shared/cards/ps2Catalog.json')

const CREATURE_STATS =
  /\*\*ST:\*\*\s*(\d+)\s+\*\*HP:\*\*\s*(\d+)\s+\*\*MHP:\*\*\s*(\d+)\s+\*\*G:\*\*\s*(\d+)(\+*)/
const COST_STATS = /\*\*G:\*\*\s*(\d+)(\+*)/

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function nameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/\bthe\b/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function existingNameKeys() {
  const keys = new Set()
  for (const path of [sagaCatalogPath, revoltCatalogPath]) {
    const catalog = JSON.parse(readFileSync(path, 'utf8'))
    for (const card of catalog.cards ?? []) {
      keys.add(nameKey(card.name))
    }
  }
  return keys
}

function cleanAbility(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\\/g, '')
    .replace(/up to a maximum of 80/gi, 'up to a maximum of 100')
    .replace(/maximum of 80/gi, 'maximum of 100')
    .replace(/\s+/g, ' ')
    .trim()
}

function parse() {
  const takenNames = existingNameKeys()
  const text = readFileSync(sourcePath, 'utf8')
  const start = text.indexOf('##  Complete Card List')
  const body = start >= 0 ? text.slice(start) : text
  const lines = body.split(/\r?\n/)

  /** @type {'creature' | 'item' | 'spell' | null} */
  let kind = null
  /** @type {'neutral' | 'fire' | 'water' | 'earth' | 'air' | 'dual' | null} */
  let element = null

  /** @type {Array<Record<string, unknown>>} */
  const cards = []
  const seenIds = new Map()
  const seenNames = new Set()
  let skippedOverlaps = 0
  let skippedExtras = 0

  for (const raw of lines) {
    const trimmed = raw.trim()
    const heading = trimmed.match(/^###\s+(.+)/)
    if (heading) {
      const lower = heading[1].toLowerCase()
      if (lower.startsWith('jump to')) continue
      if (lower.includes('spell')) {
        kind = 'spell'
        element = null
        continue
      }
      if (lower.includes('item')) {
        kind = 'item'
        element = null
        continue
      }
      const elMatch = lower.match(/\b(neutral|fire|water|earth|air|dual)\b/)
      if (elMatch && lower.includes('creature')) {
        kind = 'creature'
        element = /** @type {'neutral' | 'fire' | 'water' | 'earth' | 'air' | 'dual'} */ (
          elMatch[1]
        )
      }
      continue
    }

    if (!trimmed.startsWith('|') || trimmed.includes('---')) continue
    const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean)
    if (cells.length < 2 || !kind) continue
    const cell = cells[1]
    if (!COST_STATS.test(cell)) continue

    if (/\/medal\//i.test(trimmed) || /raritye\.gif/i.test(trimmed) || /!\[Extra\]/i.test(cell)) {
      skippedExtras += 1
      continue
    }

    const nameMatch = cell.match(/^(.+?)\s*!\[/)
    if (!nameMatch) continue
    const name = nameMatch[1].replace(/\s+/g, ' ').trim()
    if (!name || name.length > 48) continue
    const key = nameKey(name)
    if (!key || seenNames.has(key)) continue
    if (takenNames.has(key)) {
      skippedOverlaps += 1
      continue
    }

    /** @type {Record<string, unknown>} */
    let card
    if (kind === 'creature') {
      const stats = cell.match(CREATURE_STATS)
      if (!stats) continue
      card = {
        name,
        kind,
        element,
        special: false,
        st: Number(stats[1]),
        hp: Number(stats[2]),
        mhp: Number(stats[3]),
        cost: Number(stats[4]),
        costPlus: stats[5].length,
        abilityText: cleanAbility(cell.slice((stats.index ?? 0) + stats[0].length)),
        flavor: '',
        explanation: ''
      }
    } else {
      const stats = cell.match(COST_STATS)
      if (!stats) continue
      card = {
        name,
        kind,
        element: null,
        special: false,
        st: null,
        hp: null,
        mhp: null,
        cost: Number(stats[1]),
        costPlus: stats[2].length,
        abilityText: cleanAbility(cell.slice((stats.index ?? 0) + stats[0].length)),
        flavor: '',
        explanation: ''
      }
    }

    const idBase = slugify(name)
    let id = `ps2-${idBase}`
    const n = seenIds.get(idBase) ?? 0
    if (n > 0) id = `ps2-${idBase}-${n + 1}`
    seenIds.set(idBase, n + 1)
    seenNames.add(key)
    cards.push({ id, ...card, source: 'culdcept-ps2' })
  }

  const catalog = {
    version: 1,
    game: 'culdcept-ps2',
    sourceUrl:
      'https://culdceptcentral.com/ii/culdcept-ii-ps2-dc/culdcept-ps2dc-card-lists/culdcept-ps2dc-complete-card-list',
    generatedAt: new Date().toISOString(),
    counts: {
      total: cards.length,
      creature: cards.filter((c) => c.kind === 'creature').length,
      item: cards.filter((c) => c.kind === 'item').length,
      spell: cards.filter((c) => c.kind === 'spell').length
    },
    cards
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(
    `Wrote ${catalog.counts.total} unique PS2 cards (${catalog.counts.creature} creatures, ${catalog.counts.item} items, ${catalog.counts.spell} spells; skipped ${skippedOverlaps} name overlaps, ${skippedExtras} extra/medal) → ${outPath}`
  )
}

parse()
