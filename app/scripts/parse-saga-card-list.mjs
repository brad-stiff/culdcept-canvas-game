#!/usr/bin/env node
/**
 * Parses the Culdcept Central Saga complete card list (markdown export)
 * into a structured JSON catalog for the app.
 *
 * Usage: node scripts/parse-saga-card-list.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sourcePath = join(root, 'data/sources/culdcept-saga-complete-card-list.md')
const outPath = join(root, 'src/shared/cards/sagaCatalog.json')

const CREATURE_LINE =
  /^\s*(.+?)\s+ST:\s*(\d+)\s+HP:\s*(\d+)\s+MHP:\s*(\d+)\s+G:\s*(\d+)(\+*)\s*(.*)$/
const COST_LINE = /^\s*(.+?)\s+G:\s*(\d+)(\+*)\s*(.*)$/

/** First unlabeled Fire Creatures card after Special Neutral in this export. */
const FIRE_UNLOCK = new Set([
  'Balrog',
  'Birdman',
  'Burning Raptor',
  'Cerberus',
  'Chimaera',
  'Dao',
  'Decoy Doll',
  'Dragonewt',
  'Efreet',
  'Fire Drake',
  'Fire Flower',
  'Flame Lord',
  'Hell Hound',
  'Ifrit',
  'Lava Man',
  'Phoenix',
  'Salamander',
  'Solara',
  'Titan',
  'Volcanic Dragon'
])

/** Complete-list export omits ### Earth Creatures / ### Air Creatures. */
const EARTH_UNLOCK = 'Angostura'

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
  let afterDual = false
  /** @type {'none' | 'items' | 'spells'} */
  let postDualJump = 'none'
  let fireUnlocked = false

  /** @type {Array<Record<string, unknown>>} */
  const cards = []
  const seenIds = new Map()
  /** @type {Record<string, unknown> | null} */
  let pending = null

  function flushPending() {
    if (!pending) return
    const idBase = slugify(/** @type {string} */ (pending.name))
    let id = idBase
    const n = seenIds.get(idBase) ?? 0
    if (n > 0) id = `${idBase}-${n + 1}`
    seenIds.set(idBase, n + 1)
    const { _capture: _c, ...rest } = pending
    cards.push({ id, ...rest, source: 'culdcept-saga' })
    pending = null
  }

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (trimmed.startsWith('### ')) {
      flushPending()
      const lower = trimmed.slice(4).trim().toLowerCase()

      if (lower.startsWith('jump to')) {
        if (afterDual) {
          if (postDualJump === 'none') {
            postDualJump = 'items'
            kind = 'item'
            element = null
            special = false
          } else if (postDualJump === 'items') {
            postDualJump = 'spells'
            kind = 'spell'
            element = null
            special = false
          }
        } else if (kind === 'creature' && element === 'water') {
          element = 'earth'
          special = false
        } else if (kind === 'creature' && element === 'earth') {
          element = 'air'
          special = false
        }
        continue
      }

      if (lower.includes('dual')) {
        kind = 'creature'
        element = 'dual'
        special = false
        afterDual = true
        postDualJump = 'none'
        continue
      }
      if (lower.includes('special fire')) {
        kind = 'creature'
        element = 'fire'
        special = true
        fireUnlocked = true
        continue
      }
      if (lower.includes('special air')) {
        kind = 'creature'
        element = 'air'
        special = true
        continue
      }
      if (lower.includes('special neutral')) {
        kind = 'creature'
        element = 'neutral'
        special = true
        continue
      }
      if (lower.includes('water creatures')) {
        kind = 'creature'
        element = 'water'
        special = false
        continue
      }
      if (lower.includes('fire creatures')) {
        kind = 'creature'
        element = 'fire'
        special = false
        fireUnlocked = true
        continue
      }
      if (lower.includes('earth creatures')) {
        kind = 'creature'
        element = 'earth'
        special = false
        continue
      }
      if (lower.includes('air creatures')) {
        kind = 'creature'
        element = 'air'
        special = false
        continue
      }
      if (lower.includes('neutral creatures')) {
        kind = 'creature'
        element = 'neutral'
        special = false
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

    const creatureMatch = trimmed.match(CREATURE_LINE)
    if (creatureMatch && kind === 'creature') {
      flushPending()
      const name = creatureMatch[1].trim()
      if (
        !fireUnlocked &&
        special &&
        element === 'neutral' &&
        FIRE_UNLOCK.has(name)
      ) {
        element = 'fire'
        special = false
        fireUnlocked = true
      }
      if (kind === 'creature' && element === 'water' && name === EARTH_UNLOCK) {
        element = 'earth'
        special = false
      }
      pending = {
        name,
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
    game: 'culdcept-saga',
    sourceUrl:
      'https://culdceptcentral.com/culdcept-saga/culdcept-saga-card-lists/culdcept-saga-complete-card-list',
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
