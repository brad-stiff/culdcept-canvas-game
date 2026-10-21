#!/usr/bin/env node
/**
 * Parses the Culdcept Central Revolt complete card list (markdown export)
 * into a structured JSON catalog. Every id is prefixed revolt- so names
 * never collide with the Saga catalog.
 *
 * Usage: node scripts/parse-revolt-card-list.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcePath = join(root, 'data/sources/culdcept-revolt-complete-card-list.md')
const outPath = join(root, 'src/shared/cards/revoltCatalog.json')

const CREATURE_LINE =
  /^\s*(.+?)\s+ST:\s*(\d+)\s+HP:\s*(\d+)\s+MHP:\s*(\d+)\s+G:\s*(\d+)(\+*)\s*(.*)$/
const COST_LINE = /^\s*(.+?)\s+G:\s*(\d+)(\+*)\s*(.*)$/

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parse() {
  const lines = readFileSync(sourcePath, 'utf8').split(/\r?\n/)

  /** @type {'creature' | 'item' | 'spell' | null} */
  let kind = null
  /** @type {'neutral' | 'fire' | 'water' | 'earth' | 'air' | 'dual' | null} */
  let element = null
  let special = false
  let lastHeading = ''

  /** @type {Array<Record<string, unknown>>} */
  const cards = []
  const seenIds = new Map()
  /** @type {Record<string, unknown> | null} */
  let pending = null

  function flushPending() {
    if (!pending) return
    const idBase = slugify(/** @type {string} */ (pending.name))
    let id = `revolt-${idBase}`
    const n = seenIds.get(id) ?? 0
    if (n > 0) id = `revolt-${idBase}-${n + 1}`
    seenIds.set(`revolt-${idBase}`, n + 1)
    const { _capture: _c, ...rest } = pending
    cards.push({ id, ...rest, source: 'culdcept-revolt' })
    pending = null
  }

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (trimmed.startsWith('### ')) {
      flushPending()
      const lower = trimmed.slice(4).trim().toLowerCase()

      if (lower.startsWith('jump to')) {
        if (lastHeading.includes('air evo')) {
          kind = 'item'
          element = null
          special = false
        }
        continue
      }

      lastHeading = lower

      if (lower.includes('spell')) {
        kind = 'spell'
        element = null
        special = false
        continue
      }
      if (lower.includes('item') && !lower.includes('creature')) {
        kind = 'item'
        element = null
        special = false
        continue
      }

      const elMatch = lower.match(/\b(neutral|fire|water|earth|air|dual)\b/)
      if (elMatch && (lower.includes('creature') || lower.includes('evo'))) {
        kind = 'creature'
        element = /** @type {'neutral' | 'fire' | 'water' | 'earth' | 'air' | 'dual'} */ (
          elMatch[1]
        )
        special = lower.includes('special') || lower.includes('evo')
        continue
      }
      continue
    }

    if (trimmed === 'Flavor') {
      if (pending) pending._capture = 'flavor'
      continue
    }
    if (trimmed === 'Explanation') {
      if (pending) pending._capture = 'explanation'
      continue
    }
    if (trimmed === 'Advice') {
      if (pending) pending._capture = null
      continue
    }

    const creatureMatch = trimmed.match(CREATURE_LINE)
    if (creatureMatch && kind === 'creature') {
      flushPending()
      pending = {
        name: creatureMatch[1].trim(),
        kind: 'creature',
        element,
        special,
        st: Number(creatureMatch[2]),
        hp: Number(creatureMatch[3]),
        mhp: Number(creatureMatch[4]),
        cost: Number(creatureMatch[5]),
        costPlus: creatureMatch[6].length,
        abilityText: creatureMatch[7].trim(),
        flavor: '',
        explanation: '',
        _capture: null
      }
      continue
    }

    if ((kind === 'item' || kind === 'spell') && !trimmed.includes(' ST:')) {
      const costMatch = trimmed.match(COST_LINE)
      if (costMatch) {
        const name = costMatch[1].trim()
        if (name.length > 0 && name.length < 48 && !name.includes('=')) {
          flushPending()
          pending = {
            name,
            kind,
            element: null,
            special: false,
            st: null,
            hp: null,
            mhp: null,
            cost: Number(costMatch[2]),
            costPlus: costMatch[3].length,
            abilityText: costMatch[4].trim(),
            flavor: '',
            explanation: '',
            _capture: null
          }
          continue
        }
      }
    }

    if (pending && pending._capture === 'flavor' && trimmed) {
      pending.flavor = pending.flavor ? `${pending.flavor} ${trimmed}` : trimmed
      continue
    }
    if (pending && pending._capture === 'explanation' && trimmed) {
      pending.explanation = pending.explanation
        ? `${pending.explanation} ${trimmed}`
        : trimmed
      continue
    }
  }
  flushPending()

  const catalog = {
    version: 1,
    game: 'culdcept-revolt',
    sourceUrl:
      'https://www.culdceptcentral.com/culdcept-revolt/culdcept-revolt-card-lists/culdcept-revolt-complete-card-list',
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
    `Wrote ${catalog.counts.total} cards (${catalog.counts.creature} creatures, ${catalog.counts.item} items, ${catalog.counts.spell} spells) → ${outPath}`
  )
}

parse()
