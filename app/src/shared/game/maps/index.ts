import type { GameConfig } from '../types'
import { COLOSSEUM_CONFIG } from './colosseum'
import { CROSSROADS_CONFIG } from './crossroads'
import { PRACTICE_FIELD_CONFIG } from './practiceField'
import { TEMPLE_GROUNDS_CONFIG } from './templeGrounds'

export { COLOSSEUM_BOARD, COLOSSEUM_CONFIG, colosseumLayoutPositions } from './colosseum'
export { CROSSROADS_BOARD, CROSSROADS_CONFIG } from './crossroads'
export { PRACTICE_FIELD_BOARD, PRACTICE_FIELD_CONFIG } from './practiceField'
export { TEMPLE_GROUNDS_BOARD, TEMPLE_GROUNDS_CONFIG } from './templeGrounds'
export { loopLayoutPositions } from './layout'

const MAPS: Record<string, GameConfig> = {
  [COLOSSEUM_CONFIG.mapId]: COLOSSEUM_CONFIG,
  [PRACTICE_FIELD_CONFIG.mapId]: PRACTICE_FIELD_CONFIG,
  [CROSSROADS_CONFIG.mapId]: CROSSROADS_CONFIG,
  [TEMPLE_GROUNDS_CONFIG.mapId]: TEMPLE_GROUNDS_CONFIG
}

export type MapSummary = {
  mapId: string
  mapName: string
  targetMagic: number
  boardSize: number
}

export function listMaps(): MapSummary[] {
  return Object.values(MAPS).map((m) => ({
    mapId: m.mapId,
    mapName: m.mapName,
    targetMagic: m.targetMagic,
    boardSize: m.board.length
  }))
}

export function getMapConfig(mapId: string): GameConfig {
  const config = MAPS[mapId]
  if (!config) {
    throw new Error(`Unknown map: ${mapId}`)
  }
  return config
}
