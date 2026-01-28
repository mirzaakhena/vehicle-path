import { useCallback, useMemo } from 'react'
import { useScene } from './useScene'
import { useVehicles } from './useVehicles'
import { useMovementQueue } from './useMovementQueue'
import { useAnimation } from './useAnimation'
import type { SceneLineInput, CoordinateInput, VehicleInput, VehicleUpdateInput, GotoInput, GotoCommandInput, SimulationConfig, ConnectionUpdateInput } from '../../core/types/api'
import type { Line, Curve } from '../../core/types/geometry'
import type { Vehicle, GotoCommand } from '../../core/types/vehicle'
import type { TangentMode } from '../../core/types/config'
import type { VehicleEventEmitter } from '../../utils/event-emitter'
import { parseAllDSL } from '../../utils/dsl-parser'
import { validateAndCreateVehicles } from '../../utils/vehicle-helpers'
import { toLine, toCurve, toVehicleStart, toGotoCommand } from '../../utils/type-converters'

/**
 * Warning types for edge case detection
 */
export interface SimulationWarning {
  type: 'vehicle_on_removed_line' | 'movement_queue_cleared' | 'orphaned_connection' | 'dsl_parse_error'
  message: string
  details?: {
    lineId?: string
    vehicleId?: string
    vehicleIds?: string[]
    connectionCount?: number
    errors?: string[]
  }
}

/**
 * Result type with warnings for operations that may have side effects
 */
export interface SimulationResult {
  success: boolean
  error?: string
  warnings?: SimulationWarning[]
}

export interface UseVehicleSimulationProps {
  wheelbase: number
  tangentMode?: TangentMode
  eventEmitter?: VehicleEventEmitter
}

export interface UseVehicleSimulationResult {
  // State
  lines: Line[]
  curves: Curve[]
  vehicles: Vehicle[]
  movingVehicles: Vehicle[]
  getMovingVehicles: () => Vehicle[]
  vehicleQueues: Map<string, GotoCommand[]>
  error: string | null

  // Scene operations (mirrors DSL: "line001 : (141, 513) -> (362, 121)")
  addLine: (line: SceneLineInput) => SimulationResult
  updateLine: (lineId: string, updates: { start?: CoordinateInput; end?: CoordinateInput }) => SimulationResult
  removeLine: (lineId: string) => SimulationResult
  clearScene: () => void

  // Connection operations (mirrors DSL: "line001 80% -> line002 20%")
  connect: (fromLineId: string, toLineId: string, options?: { fromOffset?: number; fromIsPercentage?: boolean; toOffset?: number; toIsPercentage?: boolean }) => SimulationResult
  updateConnection: (fromLineId: string, toLineId: string, updates: ConnectionUpdateInput) => SimulationResult
  disconnect: (fromLineId: string, toLineId: string) => SimulationResult

  // Vehicle operations (mirrors DSL: "v1 start line001 0")
  addVehicles: (input: VehicleInput | VehicleInput[]) => SimulationResult
  updateVehicle: (vehicleId: string, updates: VehicleUpdateInput) => SimulationResult
  removeVehicle: (vehicleId: string) => SimulationResult
  clearVehicles: () => void

  // Movement operations (mirrors DSL: "v1 goto line001 100%")
  goto: (input: GotoInput) => SimulationResult
  clearQueue: (vehicleId?: string) => SimulationResult

  // Animation
  prepare: () => boolean
  tick: (distance: number) => boolean
  reset: () => void
  resetVehicle: (vehicleId: string) => void
  continueVehicle: (vehicleId: string) => boolean
  isMoving: () => boolean

  // DSL Loading
  loadFromDSL: (dsl: string) => SimulationResult

  // JSON Loading
  loadFromJSON: (config: SimulationConfig) => SimulationResult

  // Utility
  getVehiclesOnLine: (lineId: string) => Vehicle[]
  hasVehiclesOnLine: (lineId: string) => boolean
}

/**
 * Single entrypoint hook for vehicle path simulation.
 *
 * This hook provides a clean, DSL-like API that combines all functionality:
 * scene management, vehicles, movement commands, and animation.
 *
 * @example
 * ```typescript
 * const sim = useVehicleSimulation({ wheelbase: 30, tangentMode: 'proportional-40' })
 *
 * // Scene (mirrors DSL: "line001 : (141, 513) -> (362, 121)")
 * sim.addLine({ id: 'line001', start: [141, 513], end: [362, 121] })
 * sim.updateLine('line001', { end: [400, 150] })  // for drag
 * sim.removeLine('line001')
 *
 * // Connection (mirrors DSL: "line001 80% -> line002 20%")
 * sim.connect('line001', 'line002', { fromOffset: 0.8, toOffset: 0.2 })
 * sim.connect('line001', 'line002', { fromOffset: 150, fromIsPercentage: false, toOffset: 50, toIsPercentage: false })
 * sim.disconnect('line001', 'line002')
 *
 * // Vehicle (mirrors DSL: "v1 start line001 0")
 * sim.addVehicles({ id: 'v1', lineId: 'line001', position: 0 })
 * sim.removeVehicle('v1')
 *
 * // Movement (mirrors DSL: "v1 goto line001 100%")
 * sim.goto({ id: 'v1', lineId: 'line001', position: 1.0 })
 * sim.goto({ id: 'v1', lineId: 'line001', position: 150, isPercentage: false })
 *
 * // Animation
 * sim.prepare()
 * sim.tick(5)
 * sim.reset()
 *
 * // DSL Loading
 * sim.loadFromDSL(\`
 *   line001 : (0, 0) -> (400, 0)
 *   v1 start line001 0%
 *   v1 goto line001 100%
 * \`)
 *
 * // JSON Loading
 * sim.loadFromJSON({
 *   lines: [
 *     { id: 'line001', start: [0, 0], end: [400, 0] },
 *     { id: 'line002', start: [400, 0], end: [400, 300] }
 *   ],
 *   connections: [{ from: 'line001', to: 'line002' }],
 *   vehicles: [{ id: 'v1', lineId: 'line001', position: 0 }],
 *   movements: [
 *     { vehicleId: 'v1', targetLineId: 'line001', targetPosition: 1.0 },
 *     { vehicleId: 'v1', targetLineId: 'line002', targetPosition: 1.0 }
 *   ]
 * })
 * ```
 */
export function useVehicleSimulation({
  wheelbase,
  tangentMode = 'proportional-40',
  eventEmitter
}: UseVehicleSimulationProps): UseVehicleSimulationResult {
  // Compose primitive hooks
  const scene = useScene()
  const vehicleHook = useVehicles({ lines: scene.lines, wheelbase })
  const movementQueue = useMovementQueue({
    vehicles: vehicleHook.vehicles,
    lines: scene.lines,
    curves: scene.curves
  })
  const animation = useAnimation({
    vehicles: vehicleHook.vehicles,
    lines: scene.lines,
    vehicleQueues: movementQueue.vehicleQueues,
    getVehicleQueues: movementQueue.getVehicleQueues,
    wheelbase,
    tangentMode,
    curves: scene.curves,
    eventEmitter
  })

  // Utility: Get vehicles on a specific line
  const getVehiclesOnLine = useCallback((lineId: string): Vehicle[] => {
    return vehicleHook.vehicles.filter(v => v.lineId === lineId || v.rear.lineId === lineId)
  }, [vehicleHook.vehicles])

  // Utility: Check if any vehicles are on a line
  const hasVehiclesOnLine = useCallback((lineId: string): boolean => {
    return getVehiclesOnLine(lineId).length > 0
  }, [getVehiclesOnLine])

  // Scene: addLine
  const addLine = useCallback((line: SceneLineInput): SimulationResult => {
    const result = scene.addLine(line)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Scene: updateLine
  const updateLine = useCallback((lineId: string, updates: { start?: CoordinateInput; end?: CoordinateInput }): SimulationResult => {
    const result = scene.updateLine(lineId, updates)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Scene: removeLine with warnings
  const removeLine = useCallback((lineId: string): SimulationResult => {
    const warnings: SimulationWarning[] = []

    // Check for vehicles on this line
    const vehiclesOnLine = getVehiclesOnLine(lineId)
    if (vehiclesOnLine.length > 0) {
      warnings.push({
        type: 'vehicle_on_removed_line',
        message: `${vehiclesOnLine.length} vehicle(s) are on line '${lineId}'`,
        details: {
          lineId,
          vehicleIds: vehiclesOnLine.map(v => v.id)
        }
      })

      // Remove affected vehicles
      vehiclesOnLine.forEach(v => {
        vehicleHook.removeVehicle(v.id)
        movementQueue.clearQueue(v.id)
      })
    }

    // Check for connections that reference this line
    const affectedConnections = scene.curves.filter(
      c => c.fromLineId === lineId || c.toLineId === lineId
    )
    if (affectedConnections.length > 0) {
      warnings.push({
        type: 'orphaned_connection',
        message: `${affectedConnections.length} connection(s) will be removed`,
        details: {
          lineId,
          connectionCount: affectedConnections.length
        }
      })
    }

    const result = scene.removeLine(lineId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [scene, getVehiclesOnLine, vehicleHook, movementQueue])

  // Scene: clearScene
  const clearScene = useCallback(() => {
    scene.clear()
    vehicleHook.clear()
    movementQueue.clearQueue()
  }, [scene, vehicleHook, movementQueue])

  // Connection: connect (simplified API)
  const connect = useCallback((fromLineId: string, toLineId: string, options?: { fromOffset?: number; fromIsPercentage?: boolean; toOffset?: number; toIsPercentage?: boolean }): SimulationResult => {
    const result = scene.addConnection({
      from: fromLineId,
      to: toLineId,
      fromPosition: options?.fromOffset,
      fromIsPercentage: options?.fromIsPercentage,
      toPosition: options?.toOffset,
      toIsPercentage: options?.toIsPercentage
    })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Connection: updateConnection
  const updateConnection = useCallback((fromLineId: string, toLineId: string, updates: ConnectionUpdateInput): SimulationResult => {
    const result = scene.updateConnection(fromLineId, toLineId, updates)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Connection: disconnect
  const disconnect = useCallback((fromLineId: string, toLineId: string): SimulationResult => {
    const result = scene.removeConnection(fromLineId, toLineId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [scene])

  // Vehicle: addVehicles
  const addVehicles = useCallback((input: VehicleInput | VehicleInput[]): SimulationResult => {
    const result = vehicleHook.addVehicles(input)
    if (!result.success) {
      return { success: false, error: result.errors?.join('; ') }
    }
    return { success: true }
  }, [vehicleHook])

  // Vehicle: updateVehicle
  const updateVehicle = useCallback((vehicleId: string, updates: VehicleUpdateInput): SimulationResult => {
    const result = vehicleHook.updateVehicle(vehicleId, updates)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [vehicleHook])

  // Vehicle: removeVehicle with queue cleanup
  const removeVehicle = useCallback((vehicleId: string): SimulationResult => {
    const warnings: SimulationWarning[] = []

    // Check if vehicle has queued movements
    const queue = movementQueue.vehicleQueues.get(vehicleId)
    if (queue && queue.length > 0) {
      warnings.push({
        type: 'movement_queue_cleared',
        message: `${queue.length} queued movement(s) will be cleared for vehicle '${vehicleId}'`,
        details: {
          vehicleId
        }
      })

      // Clear the queue
      movementQueue.clearQueue(vehicleId)
    }

    const result = vehicleHook.removeVehicle(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [vehicleHook, movementQueue])

  // Vehicle: clearVehicles
  const clearVehicles = useCallback(() => {
    vehicleHook.clear()
    movementQueue.clearQueue()
  }, [vehicleHook, movementQueue])

  // Movement: goto (simplified API)
  const goto = useCallback((input: GotoInput): SimulationResult => {
    const command: GotoCommandInput = {
      targetLineId: input.lineId,
      targetPosition: input.position ?? 1.0,
      isPercentage: input.isPercentage,
      payload: input.payload
    }
    const result = movementQueue.queueMovement(input.id, command)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movementQueue])

  // Movement: clearQueue
  const clearQueue = useCallback((vehicleId?: string): SimulationResult => {
    const result = movementQueue.clearQueue(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movementQueue])

  // Wrapper for resetVehicle that also clears the queue
  const resetVehicle = useCallback((vehicleId: string): void => {
    // Clear queue first to prevent vehicle from restarting on next prepare()
    movementQueue.clearQueue(vehicleId)
    // Then reset vehicle position
    animation.resetVehicle(vehicleId)
  }, [movementQueue, animation])

  // DSL: loadFromDSL - uses core functions directly for synchronous processing
  const loadFromDSL = useCallback((dsl: string): SimulationResult => {
    const warnings: SimulationWarning[] = []
    const allErrors: string[] = []

    // 1. Parse all DSL
    const { scene: sceneParsed, vehicles: vehiclesParsed, movements: movementsParsed } = parseAllDSL(dsl)

    // Collect parse errors
    if (sceneParsed.errors.length > 0) {
      allErrors.push(...sceneParsed.errors)
    }
    if (vehiclesParsed.errors.length > 0) {
      allErrors.push(...vehiclesParsed.errors)
    }
    if (movementsParsed.errors.length > 0) {
      allErrors.push(...movementsParsed.errors)
    }

    // 2. Convert scene to internal types (synchronous)
    const lines: Line[] = sceneParsed.data.lines.map(toLine)
    const curves: Curve[] = (sceneParsed.data.connections || []).map(toCurve)

    // 3. Create vehicles using core function (synchronous)
    const vehicleStarts = vehiclesParsed.data.map(toVehicleStart)
    const { vehicles, errors: vehicleErrors } = validateAndCreateVehicles(vehicleStarts, lines, wheelbase)
    if (vehicleErrors.length > 0) {
      allErrors.push(...vehicleErrors)
    }

    // 4. Create movement queues (synchronous)
    const queues = new Map<string, GotoCommand[]>()
    for (const cmd of movementsParsed.data) {
      const queue = queues.get(cmd.vehicleId) || []
      queue.push(toGotoCommand(cmd))
      queues.set(cmd.vehicleId, queue)
    }

    // 5. Load everything at once using the internal load methods
    scene._loadScene(lines, curves)
    vehicleHook._loadVehicles(vehicles)
    movementQueue._loadQueues(queues)

    // Collect warnings if there were errors
    if (allErrors.length > 0) {
      warnings.push({
        type: 'dsl_parse_error',
        message: `DSL loading had ${allErrors.length} error(s)`,
        details: { errors: allErrors }
      })
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [scene, vehicleHook, movementQueue, wheelbase])

  // JSON: loadFromJSON - loads entire simulation from a JSON configuration object
  const loadFromJSON = useCallback((config: SimulationConfig): SimulationResult => {
    const warnings: SimulationWarning[] = []
    const allErrors: string[] = []

    // 1. Convert lines to internal types
    const lines: Line[] = config.lines.map(toLine)
    const curves: Curve[] = (config.connections || []).map(toCurve)

    // 2. Create vehicles using core function
    const vehicleStarts = (config.vehicles || []).map(toVehicleStart)
    const { vehicles, errors: vehicleErrors } = validateAndCreateVehicles(vehicleStarts, lines, wheelbase)
    if (vehicleErrors.length > 0) {
      allErrors.push(...vehicleErrors)
    }

    // 3. Create movement queues
    const queues = new Map<string, GotoCommand[]>()
    for (const cmd of (config.movements || [])) {
      const queue = queues.get(cmd.vehicleId) || []
      queue.push(toGotoCommand({
        vehicleId: cmd.vehicleId,
        targetLineId: cmd.targetLineId,
        targetPosition: cmd.targetPosition,
        isPercentage: cmd.isPercentage,
        payload: cmd.payload
      }))
      queues.set(cmd.vehicleId, queue)
    }

    // 4. Load everything at once using the internal load methods
    scene._loadScene(lines, curves)
    vehicleHook._loadVehicles(vehicles)
    movementQueue._loadQueues(queues)

    // Collect warnings if there were errors
    if (allErrors.length > 0) {
      warnings.push({
        type: 'dsl_parse_error',
        message: `JSON loading had ${allErrors.length} error(s)`,
        details: { errors: allErrors }
      })
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [scene, vehicleHook, movementQueue, wheelbase])

  // Combined error state
  const error = useMemo(() => {
    return scene.error || vehicleHook.error || movementQueue.error
  }, [scene.error, vehicleHook.error, movementQueue.error])

  return {
    // State
    lines: scene.lines,
    curves: scene.curves,
    vehicles: vehicleHook.vehicles,
    movingVehicles: animation.movingVehicles,
    getMovingVehicles: animation.getMovingVehicles,
    vehicleQueues: movementQueue.vehicleQueues,
    error,

    // Scene operations
    addLine,
    updateLine,
    removeLine,
    clearScene,

    // Connection operations
    connect,
    updateConnection,
    disconnect,

    // Vehicle operations
    addVehicles,
    updateVehicle,
    removeVehicle,
    clearVehicles,

    // Movement operations
    goto,
    clearQueue,

    // Animation (delegated to useVehicleMovement)
    prepare: animation.prepare,
    tick: animation.tick,
    reset: animation.reset,
    resetVehicle,  // Uses wrapper that also clears queue
    continueVehicle: animation.continueVehicle,
    isMoving: animation.isMoving,

    // DSL Loading
    loadFromDSL,

    // JSON Loading
    loadFromJSON,

    // Utility
    getVehiclesOnLine,
    hasVehiclesOnLine
  }
}
