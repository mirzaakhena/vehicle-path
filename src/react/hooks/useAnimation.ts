import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { Line } from '../../core/types/geometry'
import type { Vehicle, GotoCommand } from '../../core/types/vehicle'
import type { MovementConfig, SceneContext } from '../../core/types/movement'
import { buildGraph } from '../../core/algorithms/pathFinding'
import type { TangentMode } from '../../core/types/config'
import {
  handleArrival,
  moveVehicle,
  initializeAllVehicles,
  initializeMovingVehicle,
  createInitialMovementState,
  prepareCommandPath,
  type SegmentCompletionContext,
  type VehicleMovementState
} from '../../core/algorithms/vehicleMovement'
import type { VehicleEventEmitter } from '../../utils/event-emitter'

export interface UseAnimationProps {
  vehicles: Vehicle[]
  lines: Line[]
  vehicleQueues: Map<string, GotoCommand[]>
  /** Get current queues immediately (bypasses React state timing) */
  getVehicleQueues?: () => Map<string, GotoCommand[]>
  maxWheelbase: number
  tangentMode: TangentMode
  curves: import('../../core/types/geometry').Curve[]
  eventEmitter?: VehicleEventEmitter
}

/**
 * Hook for running vehicle animation/simulation.
 *
 * This hook handles the actual movement of vehicles along paths.
 * Call prepare() before starting, then tick() in your animation loop.
 *
 * @example
 * ```typescript
 * const { movingVehicles, prepare, tick, reset, isMoving } = useAnimation({
 *   vehicles, lines, vehicleQueues, wheelbase: 30, tangentMode: 'proportional-40', curves
 * })
 *
 * // Start animation
 * prepare()
 *
 * // In animation loop
 * const animate = () => {
 *   if (tick(5)) requestAnimationFrame(animate)
 * }
 * ```
 */
export function useAnimation({
  vehicles,
  lines,
  vehicleQueues,
  getVehicleQueues,
  maxWheelbase,
  tangentMode,
  curves,
  eventEmitter
}: UseAnimationProps) {
  const [movingVehicles, setMovingVehicles] = useState<Vehicle[]>([])

  // Ref for direct access to moving vehicles (bypasses React state for animation loop)
  // This allows useFrame to read positions without triggering React re-renders
  const movingVehiclesRef = useRef<Vehicle[]>([])

  // Helper to update both ref and state
  // The ref is updated immediately for animation loop access
  // The state is updated for React component re-renders (less frequent)
  const updateMovingVehicles = useCallback((updater: Vehicle[] | ((prev: Vehicle[]) => Vehicle[])) => {
    if (typeof updater === 'function') {
      setMovingVehicles(prev => {
        const next = updater(prev)
        movingVehiclesRef.current = next
        return next
      })
    } else {
      movingVehiclesRef.current = updater
      setMovingVehicles(updater)
    }
  }, [])

  // Get moving vehicles directly from ref (for animation loop)
  const getMovingVehicles = useCallback((): Vehicle[] => {
    return movingVehiclesRef.current
  }, [])

  // Create config object for movement functions
  const config: MovementConfig = useMemo(() => ({
    maxWheelbase,
    tangentMode
  }), [maxWheelbase, tangentMode])

  // Cache linesMap to avoid creating new Map on every frame
  const linesMap = useMemo(() =>
    new Map(lines.map(l => [l.id, l])),
    [lines]
  )

  // Ref for movement state (not animation)
  const movementStateRef = useRef<Map<string, VehicleMovementState>>(new Map())

  // Initialize moving vehicles when vehicles change
  useEffect(() => {
    const { movingVehicles: initialized, stateMap } = initializeAllVehicles(vehicles, linesMap)
    movementStateRef.current = stateMap

    // Update state asynchronously to avoid cascade renders
    const timeout = setTimeout(() => {
      updateMovingVehicles(initialized)
    }, 0)

    return () => clearTimeout(timeout)
  }, [vehicles, linesMap])

  // Build graph for path finding
  const graphRef = useRef<ReturnType<typeof buildGraph> | null>(null)
  useEffect(() => {
    if (lines.length > 0) {
      graphRef.current = buildGraph(lines, curves, config)
    }
  }, [lines, curves, config])

  // Epoch counter to invalidate stale events after Reset
  const epochRef = useRef(0)

  // Track if vehicles are prepared for movement
  const isPreparedRef = useRef(false)


  // Tick function - called by client to advance simulation
  // Returns true if any vehicle is still moving
  const tick = useCallback((distance: number): boolean => {
    if (!isPreparedRef.current) return false

    // Check if any vehicle is still moving
    let stillMoving = false
    for (const [, state] of movementStateRef.current) {
      if (state.vehicle.state === 'moving') {
        stillMoving = true
        break
      }
    }

    if (!stillMoving) {
      return false
    }

    // Process vehicles
    const eventsToEmit: Array<{ type: 'commandComplete' | 'commandStart' | 'stateChange' | 'positionUpdate'; data: unknown }> = []

    for (const [vehicleId, state] of movementStateRef.current) {
      if (state.vehicle.state !== 'moving' || !state.execution) continue

      const exec = state.execution

      // Move semua axle sekaligus — arrived = axles[0] (terdepan) mencapai ujung path
      const mvResult = moveVehicle(
        state.vehicle.axles,
        exec.axles,
        exec.path,
        distance,
        linesMap,
        exec.curveDataMap
      )

      // Update vehicle state in ref
      state.vehicle = {
        ...state.vehicle,
        axles: mvResult.axles
      }
      state.execution.axles = mvResult.axleExecutions

      // Check completion (based on front axle = axles[0])
      if (mvResult.arrived) {
        const segmentCtx: SegmentCompletionContext = {
          linesMap,
          config,
          vehicleQueues,
          curves,
          graphRef,
          prepareCommandPath,
          onCommandComplete: (info) => eventsToEmit.push({ type: 'commandComplete', data: info }),
          onCommandStart: (info) => eventsToEmit.push({ type: 'commandStart', data: info })
        }

        const arrivalResult = handleArrival(state, segmentCtx)

        state.vehicle = arrivalResult.vehicle
        if (arrivalResult.newExecution !== undefined) {
          state.execution = arrivalResult.newExecution
        }

        // Queue stateChange event if state changed
        if (arrivalResult.vehicle.state !== 'moving') {
          eventsToEmit.push({
            type: 'stateChange',
            data: { vehicleId, from: 'moving', to: arrivalResult.vehicle.state }
          })
        }

        // Queue position update for final position
        const axlePositions = arrivalResult.vehicle.axles.map(a => a.position)
        const front = axlePositions[0]
        const rear  = axlePositions[axlePositions.length - 1]
        eventsToEmit.push({
          type: 'positionUpdate',
          data: {
            vehicleId,
            axles: axlePositions,
            center: {
              x: axlePositions.reduce((s, p) => s + p.x, 0) / axlePositions.length,
              y: axlePositions.reduce((s, p) => s + p.y, 0) / axlePositions.length
            },
            angle: Math.atan2(front.y - rear.y, front.x - rear.x)
          }
        })
      }
    }

    // Update React state
    updateMovingVehicles(prevVehicles => {
      return prevVehicles.map(vehicle => {
        const state = movementStateRef.current.get(vehicle.id)
        return state ? state.vehicle : vehicle
      })
    })

    // Emit events after state update
    if (eventEmitter && eventsToEmit.length > 0) {
      const currentEpoch = epochRef.current
      setTimeout(() => {
        if (epochRef.current !== currentEpoch) return
        eventsToEmit.forEach(({ type, data }) => {
          eventEmitter.emit(type as 'stateChange', data as Parameters<typeof eventEmitter.emit<'stateChange'>>[1])
        })
      }, 0)
    }

    // Check again if any vehicle is still moving after this tick
    for (const [, state] of movementStateRef.current) {
      if (state.vehicle.state === 'moving') {
        return true
      }
    }

    // Animation completed naturally - reset isPreparedRef so new animation can start
    isPreparedRef.current = false
    return false
  }, [linesMap, curves, config, vehicleQueues, eventEmitter])

  // Prepare vehicles for movement (must be called before tick)
  // Returns true if at least one vehicle was prepared
  // Can be called multiple times to add new vehicles while others are already moving
  const prepare = useCallback((): boolean => {
    const graph = graphRef.current
    if (!graph) return false

    // Use getVehicleQueues() for immediate access, fall back to prop
    const currentQueues = getVehicleQueues ? getVehicleQueues() : vehicleQueues

    const vehiclesToStart: Array<{
      id: string
      fromState: 'idle' | 'waiting'
      command: GotoCommand
      startPosition: { lineId: string; absoluteOffset: number; position: import('../../core/types/geometry').Point }
    }> = []

    let anyPrepared = false

    // Prepare vehicles that are not already moving
    for (const [vehicleId, state] of movementStateRef.current) {
      const vehicle = state.vehicle

      // Skip vehicles that are already moving
      if (vehicle.state === 'moving') continue

      const queue = currentQueues.get(vehicleId)
      if (!queue || queue.length === 0) continue

      const command = queue[0]
      const sceneCtx: SceneContext = { graph, linesMap, curves, config }
      const prepared = prepareCommandPath(vehicle, command, sceneCtx)

      if (!prepared) {
        console.warn(`No path found for vehicle ${vehicleId}`)
        continue
      }

      // Hitung initialAxleExecutions: axles[0] (front) mulai di totalVehicleLength
      const totalVehicleLength = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
      let cumulative = 0
      const initialAxleExecs = [
        { currentSegmentIndex: 0, segmentDistance: totalVehicleLength }, // axles[0] = front
        ...vehicle.axleSpacings.map(spacing => {
          cumulative += spacing
          return { currentSegmentIndex: 0, segmentDistance: totalVehicleLength - cumulative }
        })
      ]

      movementStateRef.current.set(vehicleId, {
        ...state,
        execution: {
          path: prepared.path,
          curveDataMap: prepared.curveDataMap,
          currentCommandIndex: 0,
          axles: initialAxleExecs
        },
        vehicle: { ...vehicle, state: 'moving' }
      })

      anyPrepared = true

      // Vehicle was not moving, so track it for event emission
      const rearmost = vehicle.axles[vehicle.axles.length - 1]
      vehiclesToStart.push({
        id: vehicleId,
        fromState: vehicle.state as 'idle' | 'waiting',
        command,
        startPosition: {
          lineId: rearmost.lineId,
          absoluteOffset: rearmost.absoluteOffset,
          position: rearmost.position
        }
      })
    }

    if (!anyPrepared) return false

    isPreparedRef.current = true

    // Update React state
    updateMovingVehicles(prevVehicles => {
      return prevVehicles.map(vehicle => {
        const state = movementStateRef.current.get(vehicle.id)
        return state ? state.vehicle : vehicle
      })
    })

    // Emit events
    if (eventEmitter && vehiclesToStart.length > 0) {
      const currentEpoch = epochRef.current
      setTimeout(() => {
        if (epochRef.current !== currentEpoch) return
        vehiclesToStart.forEach(({ id, fromState, command, startPosition }) => {
          eventEmitter.emit('commandStart', {
            vehicleId: id,
            command,
            commandIndex: 0,
            startPosition
          })
          eventEmitter.emit('stateChange', {
            vehicleId: id,
            from: fromState,
            to: 'moving'
          })
        })
      }, 0)
    }

    return true
  }, [linesMap, curves, vehicleQueues, getVehicleQueues, config, eventEmitter])

  // Reset to initial state
  const reset = useCallback(() => {
    // Increment epoch to invalidate any pending stale events
    epochRef.current++
    isPreparedRef.current = false

    // Re-initialize from vehicles prop
    const { movingVehicles: initialized, stateMap } = initializeAllVehicles(vehicles, linesMap)
    movementStateRef.current = stateMap
    updateMovingVehicles(initialized)
  }, [vehicles, linesMap])

  // Reset a single vehicle to its initial state (from vehicles prop)
  // This does NOT affect other vehicles
  const resetVehicle = useCallback((vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) return

    const line = linesMap.get(vehicle.lineId)
    if (!line) return

    // Re-initialize just this vehicle
    const movingVehicle = initializeMovingVehicle(vehicle, line)
    const state = createInitialMovementState(movingVehicle)

    // Update only this vehicle's state
    movementStateRef.current.set(vehicleId, state)

    // Update only this vehicle in movingVehicles
    updateMovingVehicles(prev => prev.map(v =>
      v.id === vehicleId ? movingVehicle : v
    ))
  }, [vehicles, linesMap])

  // Continue a waiting vehicle (resume to next command after arrival)
  // Returns true if vehicle was continued, false otherwise
  const continueVehicle = useCallback((vehicleId: string): boolean => {
    const state = movementStateRef.current.get(vehicleId)
    if (!state || state.vehicle.state !== 'waiting') {
      return false
    }

    const queue = vehicleQueues.get(vehicleId)
    const exec = state.execution
    if (!exec) return false

    const nextCommandIndex = exec.currentCommandIndex + 1

    if (queue && nextCommandIndex < queue.length) {
      const graph = graphRef.current
      if (graph) {
        const nextCommand = queue[nextCommandIndex]
        const sceneCtx: SceneContext = { graph, linesMap, curves, config }
        const prepared = prepareCommandPath(state.vehicle, nextCommand, sceneCtx)

        if (prepared) {
          const totalLen = state.vehicle.axleSpacings.reduce((a, b) => a + b, 0)
          let cum = 0
          const axleExecs = [
            { currentSegmentIndex: 0, segmentDistance: totalLen },
            ...state.vehicle.axleSpacings.map(s => {
              cum += s
              return { currentSegmentIndex: 0, segmentDistance: totalLen - cum }
            })
          ]

          state.execution = {
            path: prepared.path,
            curveDataMap: prepared.curveDataMap,
            currentCommandIndex: nextCommandIndex,
            axles: axleExecs
          }
          state.vehicle = { ...state.vehicle, state: 'moving' }

          updateMovingVehicles(prev => prev.map(v => v.id === vehicleId ? state.vehicle : v))

          // Emit stateChange event
          if (eventEmitter) {
            const currentEpoch = epochRef.current
            setTimeout(() => {
              if (epochRef.current !== currentEpoch) return
              eventEmitter.emit('stateChange', {
                vehicleId,
                from: 'waiting',
                to: 'moving'
              })
            }, 0)
          }

          return true
        }
      }
    }

    // No more commands - set to idle
    state.vehicle = { ...state.vehicle, state: 'idle' }
    state.execution = null

    updateMovingVehicles(prev => prev.map(v => v.id === vehicleId ? state.vehicle : v))

    // Emit stateChange event
    if (eventEmitter) {
      const currentEpoch = epochRef.current
      setTimeout(() => {
        if (epochRef.current !== currentEpoch) return
        eventEmitter.emit('stateChange', {
          vehicleId,
          from: 'waiting',
          to: 'idle'
        })
      }, 0)
    }

    return true
  }, [vehicleQueues, linesMap, curves, config, eventEmitter])

  // Check if any vehicle is currently moving
  const isMoving = useCallback((): boolean => {
    for (const [, state] of movementStateRef.current) {
      if (state.vehicle.state === 'moving') {
        return true
      }
    }
    return false
  }, [])

  return {
    movingVehicles,
    getMovingVehicles,
    prepare,
    tick,
    reset,
    resetVehicle,
    continueVehicle,
    isMoving,
    isPrepared: isPreparedRef.current
  }
}
