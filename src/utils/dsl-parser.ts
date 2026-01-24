/**
 * DSL Parser Utilities
 *
 * These utilities convert DSL text into API-compatible types that can be used
 * with the programmatic hooks (useScene, useVehicles, useMovement).
 *
 * @example
 * ```typescript
 * import { parseSceneDSL, parseVehiclesDSL, parseMovementDSL } from 'vehicle-path/utils'
 *
 * const sceneConfig = parseSceneDSL(`
 *   line001 : (100, 100) -> (700, 100)
 *   line002 : (700, 100) -> (700, 400)
 *   line001 -> line002
 * `)
 * setScene(sceneConfig)
 *
 * const vehicles = parseVehiclesDSL(`
 *   v1 start line001 0%
 *   v2 start line002 50%
 * `)
 * vehicles.forEach(v => addVehicle(v))
 *
 * const movements = parseMovementDSL(`
 *   v1 goto line002 100% --wait
 * `)
 * movements.forEach(m => queueMovement(m.vehicleId, m))
 * ```
 */

import type { SceneConfig, SceneLineInput, SceneConnectionInput, VehicleInput, MovementInput } from '../core/types/api'

/**
 * Parse result with errors for validation feedback
 */
export interface ParseResult<T> {
  data: T
  errors: string[]
}

/**
 * Movement command parsed from DSL (includes vehicleId for routing)
 */
export interface MovementCommand extends MovementInput {
  vehicleId: string
}

/**
 * Parse scene DSL into SceneConfig for useScene.setScene()
 *
 * DSL Format:
 * ```
 * # Lines
 * line001 : (100, 100) -> (700, 100)
 * line002 : (700, 100) -> (700, 400)
 *
 * # Connections (curves)
 * line001 -> line002
 * line001 80% -> line002 20%
 * ```
 *
 * @param text - DSL text to parse
 * @returns ParseResult containing SceneConfig and any parsing errors
 */
export function parseSceneDSL(text: string): ParseResult<SceneConfig> {
  const lines: SceneLineInput[] = []
  const connections: SceneConnectionInput[] = []
  const errors: string[] = []

  const textLines = text.trim().split('\n')
  let lineNumber = 0

  for (const line of textLines) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Parse line: line001 : (100, 100) -> (500, 100)
    const lineMatch = trimmed.match(/^(\w+)\s*:\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)\s*->\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/)
    if (lineMatch) {
      lines.push({
        id: lineMatch[1],
        start: [parseFloat(lineMatch[2]), parseFloat(lineMatch[3])],
        end: [parseFloat(lineMatch[4]), parseFloat(lineMatch[5])]
      })
      continue
    }

    // Parse connection: line001 -> line002 or line001 80% -> line002 20%
    const connMatch = trimmed.match(/^(\w+)(?:\s+(\d+(?:\.\d+)?)(%?))??\s*->\s*(\w+)(?:\s+(\d+(?:\.\d+)?)(%?))?/)
    if (connMatch) {
      const connection: SceneConnectionInput = {
        from: connMatch[1],
        to: connMatch[4]
      }

      // Parse from position if present (convert 0-100% to 0-1)
      if (connMatch[2]) {
        const fromValue = parseFloat(connMatch[2])
        connection.fromPosition = connMatch[3] === '%' ? fromValue / 100 : fromValue / 100
      }

      // Parse to position if present (convert 0-100% to 0-1)
      if (connMatch[5]) {
        const toValue = parseFloat(connMatch[5])
        connection.toPosition = connMatch[6] === '%' ? toValue / 100 : toValue / 100
      }

      connections.push(connection)
      continue
    }

    // Skip vehicle start lines (handled by parseVehiclesDSL)
    if (trimmed.match(/^\w+\s+start\s+/)) {
      continue
    }

    // Skip goto commands (handled by parseMovementDSL)
    if (trimmed.match(/^\w+\s+goto\s+/)) {
      continue
    }

    // Unknown line format
    errors.push(`Line ${lineNumber}: Unable to parse "${trimmed}"`)
  }

  return {
    data: {
      lines,
      connections: connections.length > 0 ? connections : undefined
    },
    errors
  }
}

/**
 * Parse vehicle DSL into VehicleInput[] for useVehicles.addVehicles()
 *
 * DSL Format:
 * ```
 * v1 start line001 0%
 * v2 start line002 50%
 * v3 start line001 100  # absolute offset
 * ```
 *
 * @param text - DSL text to parse
 * @returns ParseResult containing VehicleInput[] and any parsing errors
 */
export function parseVehiclesDSL(text: string): ParseResult<VehicleInput[]> {
  const vehicles: VehicleInput[] = []
  const errors: string[] = []

  const textLines = text.trim().split('\n')
  let lineNumber = 0

  for (const line of textLines) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Parse vehicle start: v1 start line001 10 or v2 start line002 20%
    const vehicleMatch = trimmed.match(/^(\w+)\s+start\s+(\w+)\s+(\d+(?:\.\d+)?)(%?)/)
    if (vehicleMatch) {
      const offset = parseFloat(vehicleMatch[3])
      const isPercentage = vehicleMatch[4] === '%'

      vehicles.push({
        id: vehicleMatch[1],
        lineId: vehicleMatch[2],
        // API uses 0-1 for percentage, DSL uses 0-100
        position: isPercentage ? offset / 100 : offset,
        isPercentage
      })
      continue
    }

    // Skip scene lines (handled by parseSceneDSL)
    if (trimmed.match(/^\w+\s*:\s*\(/) || trimmed.match(/^\w+.*->\s*\w+/)) {
      continue
    }

    // Skip goto commands (handled by parseMovementDSL)
    if (trimmed.match(/^\w+\s+goto\s+/)) {
      continue
    }

    // If it looks like a vehicle command but doesn't match, report error
    if (trimmed.match(/^\w+\s+start/)) {
      errors.push(`Line ${lineNumber}: Invalid vehicle start format "${trimmed}"`)
    }
  }

  return {
    data: vehicles,
    errors
  }
}

/**
 * Parse movement DSL into MovementCommand[] for useMovement.queueMovement()
 *
 * DSL Format:
 * ```
 * v1 goto line001 100%
 * v1 goto line002 50% --wait
 * v2 goto line001 0% --payload {"orderId": "123"}
 * v1 goto line003 100% --wait --payload {"message": "hello"}
 * ```
 *
 * @param text - DSL text to parse
 * @returns ParseResult containing MovementCommand[] and any parsing errors
 */
export function parseMovementDSL(text: string): ParseResult<MovementCommand[]> {
  const commands: MovementCommand[] = []
  const errors: string[] = []

  const textLines = text.trim().split('\n')
  let lineNumber = 0

  for (const line of textLines) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Parse base goto command: v1 goto line001 100%
    const baseMatch = trimmed.match(/^(\w+)\s+goto\s+(\w+)\s+(\d+(?:\.\d+)?)(%?)/)
    if (baseMatch) {
      // Get remainder after base command for flags
      const remainder = trimmed.slice(baseMatch[0].length)

      // Check for --wait flag
      const hasWait = remainder.includes('--wait')

      // Check for --payload JSON
      let payload: unknown
      const payloadMatch = remainder.match(/--payload\s+(\{.*\})/)
      if (payloadMatch) {
        try {
          payload = JSON.parse(payloadMatch[1])
        } catch {
          errors.push(`Line ${lineNumber}: Invalid JSON payload "${payloadMatch[1]}"`)
        }
      }

      const offset = parseFloat(baseMatch[3])
      const isPercentage = baseMatch[4] === '%'

      commands.push({
        vehicleId: baseMatch[1],
        targetLineId: baseMatch[2],
        // API uses 0-1 for percentage, DSL uses 0-100
        // For absolute offsets, keep the raw value
        targetPosition: isPercentage ? offset / 100 : offset,
        isPercentage,
        wait: hasWait || undefined,
        payload
      })
      continue
    }

    // Skip scene lines (handled by parseSceneDSL)
    if (trimmed.match(/^\w+\s*:\s*\(/) || trimmed.match(/^\w+.*->\s*\w+/)) {
      continue
    }

    // Skip vehicle start lines (handled by parseVehiclesDSL)
    if (trimmed.match(/^\w+\s+start\s+/)) {
      continue
    }

    // If it looks like a goto command but doesn't match, report error
    if (trimmed.match(/^\w+\s+goto/)) {
      errors.push(`Line ${lineNumber}: Invalid goto command format "${trimmed}"`)
    }
  }

  return {
    data: commands,
    errors
  }
}

/**
 * Parse all DSL types from a single text block
 *
 * This is useful when you have a combined DSL that includes scene, vehicles, and movements.
 *
 * @param text - Combined DSL text to parse
 * @returns Object containing parsed scene, vehicles, and movements with errors
 */
export function parseAllDSL(text: string): {
  scene: ParseResult<SceneConfig>
  vehicles: ParseResult<VehicleInput[]>
  movements: ParseResult<MovementCommand[]>
} {
  return {
    scene: parseSceneDSL(text),
    vehicles: parseVehiclesDSL(text),
    movements: parseMovementDSL(text)
  }
}

// =============================================================================
// DSL Generation Functions
// =============================================================================

/**
 * Helper to extract coordinates from CoordinateInput
 */
function getCoords(coord: [number, number] | { x: number; y: number }): { x: number; y: number } {
  if (Array.isArray(coord)) {
    return { x: coord[0], y: coord[1] }
  }
  return coord
}

/**
 * Generate scene DSL from SceneConfig
 *
 * @param config - SceneConfig from programmatic API
 * @returns DSL text representation
 *
 * @example
 * ```typescript
 * const dsl = generateSceneDSL({
 *   lines: [{ id: 'line001', start: [100, 100], end: [500, 100] }],
 *   connections: [{ from: 'line001', to: 'line002' }]
 * })
 * // Returns:
 * // line001 : (100, 100) -> (500, 100)
 * //
 * // line001 -> line002
 * ```
 */
export function generateSceneDSL(config: SceneConfig): string {
  const parts: string[] = []

  // Generate lines
  for (const line of config.lines) {
    const start = getCoords(line.start)
    const end = getCoords(line.end)
    parts.push(`${line.id} : (${Math.round(start.x)}, ${Math.round(start.y)}) -> (${Math.round(end.x)}, ${Math.round(end.y)})`)
  }

  // Add blank line between sections if both exist
  if (config.lines.length > 0 && config.connections && config.connections.length > 0) {
    parts.push('')
  }

  // Generate connections
  if (config.connections) {
    for (const conn of config.connections) {
      let connStr = conn.from

      // Add from position if present (convert 0-1 to 0-100%)
      if (conn.fromPosition !== undefined) {
        const isPercentage = conn.fromIsPercentage !== false // default true
        if (isPercentage) {
          connStr += ` ${conn.fromPosition * 100}%`
        } else {
          connStr += ` ${conn.fromPosition}`
        }
      }

      connStr += ' -> '
      connStr += conn.to

      // Add to position if present (convert 0-1 to 0-100%)
      if (conn.toPosition !== undefined) {
        const isPercentage = conn.toIsPercentage !== false // default true
        if (isPercentage) {
          connStr += ` ${conn.toPosition * 100}%`
        } else {
          connStr += ` ${conn.toPosition}`
        }
      }

      parts.push(connStr)
    }
  }

  return parts.join('\n')
}

/**
 * Generate vehicles DSL from VehicleInput[]
 *
 * @param vehicles - Array of VehicleInput from programmatic API
 * @returns DSL text representation
 *
 * @example
 * ```typescript
 * const dsl = generateVehiclesDSL([
 *   { id: 'v1', lineId: 'line001', position: 0.5, isPercentage: true }
 * ])
 * // Returns: "v1 start line001 50%"
 * ```
 */
export function generateVehiclesDSL(vehicles: VehicleInput[]): string {
  return vehicles.map(v => {
    const position = v.position ?? 0
    const isPercentage = v.isPercentage !== false // default true

    if (isPercentage) {
      // Convert 0-1 to 0-100%
      return `${v.id} start ${v.lineId} ${position * 100}%`
    } else {
      return `${v.id} start ${v.lineId} ${position}`
    }
  }).join('\n')
}

/**
 * Generate movement DSL from MovementCommand[]
 *
 * @param commands - Array of MovementCommand from programmatic API
 * @returns DSL text representation
 *
 * @example
 * ```typescript
 * const dsl = generateMovementDSL([
 *   { vehicleId: 'v1', targetLineId: 'line002', targetPosition: 1.0, wait: true }
 * ])
 * // Returns: "v1 goto line002 100% --wait"
 * ```
 */
export function generateMovementDSL(commands: MovementCommand[]): string {
  return commands.map(cmd => {
    const targetPosition = cmd.targetPosition ?? 1.0
    const isPercentage = cmd.isPercentage !== false // default true

    let cmdStr = cmd.vehicleId
    cmdStr += ` goto ${cmd.targetLineId}`

    if (isPercentage) {
      // Convert 0-1 to 0-100%
      cmdStr += ` ${targetPosition * 100}%`
    } else {
      cmdStr += ` ${targetPosition}`
    }

    if (cmd.wait) {
      cmdStr += ' --wait'
    }

    if (cmd.payload !== undefined) {
      cmdStr += ` --payload ${JSON.stringify(cmd.payload)}`
    }

    return cmdStr
  }).join('\n')
}
