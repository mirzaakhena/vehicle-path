import { useCallback, useMemo } from 'react'
import { useScene } from './useScene'
import { useVehicles } from './useVehicles'
import { useMovement } from './useMovement'
import { useVehicleMovement } from './useVehicleMovement'
import type { SceneLineInput, CoordinateInput, VehicleInput, MovementInput } from '../../core/types/api'
import type { Line, Curve } from '../../core/types/geometry'
import type { Vehicle, GotoCommand } from '../../core/types/vehicle'
import type { TangentMode } from '../../core/types/config'
import type { VehicleEventEmitter } from '../../utils/event-emitter'
import { parseAllDSL } from '../../utils/dsl-parser'

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
  vehicleQueues: Map<string, GotoCommand[]>
  error: string | null

  // Scene operations (mirrors DSL: "line001 : (141, 513) -> (362, 121)")
  addLine: (line: SceneLineInput) => SimulationResult
  updateLine: (lineId: string, updates: { start?: CoordinateInput; end?: CoordinateInput }) => SimulationResult
  removeLine: (lineId: string) => SimulationResult
  clearScene: () => void

  // Connection operations (mirrors DSL: "line001 80% -> line002 20%")
  connect: (fromLineId: string, toLineId: string, options?: { from?: number; to?: number }) => SimulationResult
  disconnect: (fromLineId: string, toLineId: string) => SimulationResult

  // Vehicle operations (mirrors DSL: "v1 start line001 0")
  addVehicle: (input: VehicleInput) => SimulationResult
  removeVehicle: (vehicleId: string) => SimulationResult
  clearVehicles: () => void

  // Movement operations (mirrors DSL: "v1 goto line001 100%")
  goto: (vehicleId: string, targetLineId: string, targetPosition?: number) => SimulationResult
  clearQueue: (vehicleId?: string) => SimulationResult

  // Animation
  prepare: () => boolean
  tick: (distance: number) => boolean
  reset: () => void
  continueVehicle: (vehicleId: string) => boolean
  isMoving: () => boolean

  // DSL Loading
  loadFromDSL: (dsl: string) => SimulationResult

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
 * sim.connect('line001', 'line002', { from: 0.8, to: 0.2 })
 * sim.disconnect('line001', 'line002')
 *
 * // Vehicle (mirrors DSL: "v1 start line001 0")
 * sim.addVehicle({ id: 'v1', lineId: 'line001', position: 0 })
 * sim.removeVehicle('v1')
 *
 * // Movement (mirrors DSL: "v1 goto line001 100%")
 * sim.goto('v1', 'line001', 1.0)
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
  const movement = useMovement({
    vehicles: vehicleHook.vehicles,
    lines: scene.lines,
    curves: scene.curves
  })
  const vehicleMovement = useVehicleMovement({
    vehicles: vehicleHook.vehicles,
    lines: scene.lines,
    vehicleQueues: movement.vehicleQueues,
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
        movement.clearQueue(v.id)
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
  }, [scene, getVehiclesOnLine, vehicleHook, movement])

  // Scene: clearScene
  const clearScene = useCallback(() => {
    scene.clear()
    vehicleHook.clear()
    movement.clearQueue()
  }, [scene, vehicleHook, movement])

  // Connection: connect (simplified API)
  const connect = useCallback((fromLineId: string, toLineId: string, options?: { from?: number; to?: number }): SimulationResult => {
    const result = scene.addConnection({
      from: fromLineId,
      to: toLineId,
      fromPosition: options?.from,
      toPosition: options?.to
    })
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

  // Vehicle: addVehicle
  const addVehicle = useCallback((input: VehicleInput): SimulationResult => {
    const result = vehicleHook.addVehicle(input)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [vehicleHook])

  // Vehicle: removeVehicle with queue cleanup
  const removeVehicle = useCallback((vehicleId: string): SimulationResult => {
    const warnings: SimulationWarning[] = []

    // Check if vehicle has queued movements
    const queue = movement.vehicleQueues.get(vehicleId)
    if (queue && queue.length > 0) {
      warnings.push({
        type: 'movement_queue_cleared',
        message: `${queue.length} queued movement(s) will be cleared for vehicle '${vehicleId}'`,
        details: {
          vehicleId
        }
      })

      // Clear the queue
      movement.clearQueue(vehicleId)
    }

    const result = vehicleHook.removeVehicle(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }, [vehicleHook, movement])

  // Vehicle: clearVehicles
  const clearVehicles = useCallback(() => {
    vehicleHook.clear()
    movement.clearQueue()
  }, [vehicleHook, movement])

  // Movement: goto (simplified API)
  const goto = useCallback((vehicleId: string, targetLineId: string, targetPosition: number = 1.0): SimulationResult => {
    const input: MovementInput = {
      targetLineId,
      targetPosition
    }
    const result = movement.queueMovement(vehicleId, input)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movement])

  // Movement: clearQueue
  const clearQueue = useCallback((vehicleId?: string): SimulationResult => {
    const result = movement.clearQueue(vehicleId)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  }, [movement])

  // DSL: loadFromDSL
  const loadFromDSL = useCallback((dsl: string): SimulationResult => {
    const warnings: SimulationWarning[] = []
    const allErrors: string[] = []

    // Parse all DSL
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

    if (allErrors.length > 0) {
      warnings.push({
        type: 'dsl_parse_error',
        message: `DSL parsing had ${allErrors.length} error(s)`,
        details: { errors: allErrors }
      })
    }

    // Clear existing state
    scene.clear()
    vehicleHook.clear()
    movement.clearQueue()

    // Load scene
    const sceneResult = scene.setScene(sceneParsed.data)
    if (!sceneResult.success && sceneResult.errors) {
      return {
        success: false,
        error: sceneResult.errors.join('; '),
        warnings: warnings.length > 0 ? warnings : undefined
      }
    }

    // Load vehicles
    for (const vehicleInput of vehiclesParsed.data) {
      const result = vehicleHook.addVehicle(vehicleInput)
      if (!result.success) {
        allErrors.push(result.error || `Failed to add vehicle ${vehicleInput.id}`)
      }
    }

    // Load movements
    for (const cmd of movementsParsed.data) {
      const result = movement.queueMovement(cmd.vehicleId, {
        targetLineId: cmd.targetLineId,
        targetPosition: cmd.targetPosition,
        isPercentage: cmd.isPercentage,
        wait: cmd.wait,
        payload: cmd.payload
      })
      if (!result.success) {
        allErrors.push(result.error || `Failed to queue movement for ${cmd.vehicleId}`)
      }
    }

    // Update warnings if more errors occurred
    if (allErrors.length > 0 && warnings.length === 0) {
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
  }, [scene, vehicleHook, movement])

  // Combined error state
  const error = useMemo(() => {
    return scene.error || vehicleHook.error || movement.error
  }, [scene.error, vehicleHook.error, movement.error])

  return {
    // State
    lines: scene.lines,
    curves: scene.curves,
    vehicles: vehicleHook.vehicles,
    movingVehicles: vehicleMovement.movingVehicles,
    vehicleQueues: movement.vehicleQueues,
    error,

    // Scene operations
    addLine,
    updateLine,
    removeLine,
    clearScene,

    // Connection operations
    connect,
    disconnect,

    // Vehicle operations
    addVehicle,
    removeVehicle,
    clearVehicles,

    // Movement operations
    goto,
    clearQueue,

    // Animation (delegated to useVehicleMovement)
    prepare: vehicleMovement.prepare,
    tick: vehicleMovement.tick,
    reset: vehicleMovement.reset,
    continueVehicle: vehicleMovement.continueVehicle,
    isMoving: vehicleMovement.isMoving,

    // DSL Loading
    loadFromDSL,

    // Utility
    getVehiclesOnLine,
    hasVehiclesOnLine
  }
}
