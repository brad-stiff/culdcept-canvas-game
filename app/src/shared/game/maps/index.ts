import type { GameConfig } from '../types'
import { COLOSSEUM_CONFIG } from './colosseum'
import { PRACTICE_FIELD_CONFIG } from './practiceField'

export { COLOSSEUM_BOARD, COLOSSEUM_CONFIG, colosseumLayoutPositions } from './colosseum'
export { PRACTICE_FIELD_BOARD, PRACTICE_FIELD_CONFIG } from './practiceField'
export { loopLayoutPositions } from './layout'

const MAPS: Record<string, GameConfig> = {
  [COLOSSEUM_CONFIG.mapId]: COLOSSEUM_CONFIG,
  [PRACTICE_FIELD_CONFIG.mapId]: PRACTICE_FIELD_CONFIG
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
