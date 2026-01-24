/**
 * Vehicle Movement Module
 *
 * Handles dual-axle vehicle movement including:
 * - Position calculations (line and curve)
 * - Arc-length tracking for wheelbase
 * - Path preparation and execution
 * - Segment transitions
 */

import type { Line, Point, Curve } from '../types/geometry'
import type { Vehicle, AxleState, GotoCommand, GotoCompletionCallback } from '../types/vehicle'
import type {
  VehicleMovementState,
  PathExecutionState,
  AxleExecutionState,
  CurveData,
  SceneContext,
  MovementConfig
} from '../types/movement'
import type { PathResult } from './pathFinding'
import type { CommandStartInfo } from '../../utils/event-emitter'
import { findPath, resolveFromLineOffset, resolveToLineOffset } from './pathFinding'
import { createBezierCurve, buildArcLengthTable, getPointOnBezier, distanceToT } from './math'

// Re-export types for convenience
export type { CurveData, PathExecutionState, VehicleMovementState } from '../types/movement'

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Get position on line from absolute offset
 * This is a pure function that converts absolute offset to Point coordinates
 */
export function getPositionFromOffset(line: Line, absoluteOffset: number): Point {
  const lineLength = Math.sqrt(
    Math.pow(line.end.x - line.start.x, 2) + Math.pow(line.end.y - line.start.y, 2)
  )
  const t = lineLength > 0 ? absoluteOffset / lineLength : 0
  return {
    x: line.start.x + (line.end.x - line.start.x) * Math.min(1, Math.max(0, t)),
    y: line.start.y + (line.end.y - line.start.y) * Math.min(1, Math.max(0, t))
  }
}

/**
 * Calculate line length
 */
export function getLineLength(line: Line): number {
  return Math.sqrt(
    Math.pow(line.end.x - line.start.x, 2) + Math.pow(line.end.y - line.start.y, 2)
  )
}

// ============================================================================
// Arc-Length Tracking
// ============================================================================

/**
 * Calculate cumulative arc-length from start of path
 *
 * @param path - The path being followed
 * @param segmentIndex - Current segment index
 * @param segmentDistance - Distance along current segment
 * @returns Total arc-length from path start
 */
export function getCumulativeArcLength(
  path: PathResult,
  segmentIndex: number,
  segmentDistance: number
): number {
  let cumulative = 0

  // Add lengths of all previous segments
  for (let i = 0; i < segmentIndex; i++) {
    cumulative += path.segments[i].length
  }

  // Add distance in current segment
  cumulative += segmentDistance

  return cumulative
}

/**
 * Convert arc-length to segment position
 *
 * @param path - The path being followed
 * @param targetArcLength - Target cumulative arc-length
 * @returns Segment position or null if exceeds path length
 */
export function arcLengthToSegmentPosition(
  path: PathResult,
  targetArcLength: number
): { segmentIndex: number; segmentDistance: number } | null {
  let cumulative = 0

  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i]
    const segmentEnd = cumulative + segment.length

    // Check if target is within this segment
    if (targetArcLength < segmentEnd) {
      return {
        segmentIndex: i,
        segmentDistance: targetArcLength - cumulative
      }
    }

    // Check if target is exactly at segment boundary
    if (targetArcLength === segmentEnd) {
      // If there's a next segment, return start of next segment
      if (i + 1 < path.segments.length) {
        return {
          segmentIndex: i + 1,
          segmentDistance: 0
        }
      }
      // Otherwise, return end of current segment
      return {
        segmentIndex: i,
        segmentDistance: segment.length
      }
    }

    cumulative += segment.length
  }

  // Target exceeds path length
  return null
}

/**
 * Calculate front axle position from rear position + wheelbase
 *
 * @param path - The path being followed
 * @param rearSegmentIndex - Rear axle segment index
 * @param rearSegmentDistance - Rear axle distance in segment
 * @param wheelbase - Distance between front and rear axles
 * @returns Front axle position or null if exceeds path
 */
export function calculateFrontAxlePosition(
  path: PathResult,
  rearSegmentIndex: number,
  rearSegmentDistance: number,
  wheelbase: number
): { segmentIndex: number; segmentDistance: number } | null {
  // Calculate rear axle's cumulative arc-length
  const rearArcLength = getCumulativeArcLength(
    path,
    rearSegmentIndex,
    rearSegmentDistance
  )

  // Front axle is ahead by wheelbase
  const frontArcLength = rearArcLength + wheelbase

  // Convert back to segment position
  return arcLengthToSegmentPosition(path, frontArcLength)
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Calculate initial front axle position from rear position
 *
 * @param rLineId - Rear axle line ID
 * @param rAbsoluteOffset - Rear axle absolute offset on line
 * @param wheelbase - Distance between front and rear axles
 * @param line - The line the vehicle is on
 * @returns Front axle state
 */
export function calculateInitialFrontPosition(
  rLineId: string,
  rAbsoluteOffset: number,
  wheelbase: number,
  line: Line
): AxleState {
  const lineLength = Math.sqrt(
    Math.pow(line.end.x - line.start.x, 2) +
    Math.pow(line.end.y - line.start.y, 2)
  )

  // F is ahead of R by wheelbase
  let fAbsoluteOffset = rAbsoluteOffset + wheelbase

  // Clamp to line end
  fAbsoluteOffset = Math.min(fAbsoluteOffset, lineLength)

  const fPosition = getPositionFromOffset(line, fAbsoluteOffset)

  return {
    lineId: rLineId,
    position: fPosition,
    absoluteOffset: fAbsoluteOffset
  }
}

/**
 * Initialize Vehicle with runtime state for dual-axle
 *
 * @param vehicle - Vehicle to initialize (must have rear and front already populated)
 * @param _line - The line (kept for compatibility)
 * @returns Vehicle with state set to idle
 */
export function initializeMovingVehicle(
  vehicle: Vehicle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _line: Line
): Vehicle {
  return {
    ...vehicle,
    state: 'idle'
  }
}

/**
 * Create initial movement state for a vehicle
 */
export function createInitialMovementState(vehicle: Vehicle): VehicleMovementState {
  return {
    vehicle,
    execution: null
  }
}

export interface InitializationResult {
  movingVehicles: Vehicle[]
  stateMap: Map<string, VehicleMovementState>
}

/**
 * Initialize all vehicles and their movement states
 *
 * @param vehicles - Array of vehicles to initialize
 * @param linesMap - Map of line IDs to Line objects
 * @returns InitializationResult with moving vehicles and state map
 */
export function initializeAllVehicles(
  vehicles: Vehicle[],
  linesMap: Map<string, Line>
): InitializationResult {
  const movingVehicles: Vehicle[] = []
  const stateMap = new Map<string, VehicleMovementState>()

  for (const vehicle of vehicles) {
    const line = linesMap.get(vehicle.lineId)
    if (!line) continue

    const movingVehicle = initializeMovingVehicle(vehicle, line)
    movingVehicles.push(movingVehicle)

    const state = createInitialMovementState(movingVehicle)
    stateMap.set(vehicle.id, state)
  }

  return { movingVehicles, stateMap }
}

// ============================================================================
// Position Update
// ============================================================================

/**
 * Calculate position on line (pure function)
 *
 * @param line - The line to calculate position on
 * @param absoluteOffset - The offset along the line
 * @returns Position data
 */
export function calculatePositionOnLine(
  line: Line,
  absoluteOffset: number
): { position: Point; lineId: string; absoluteOffset: number } {
  const position = getPositionFromOffset(line, absoluteOffset)
  return { position, lineId: line.id, absoluteOffset }
}

/**
 * Calculate position on curve (pure function)
 *
 * @param curveData - The curve data with arc-length table
 * @param segmentDistance - Distance along the curve
 * @returns Position data
 */
export function calculatePositionOnCurve(
  curveData: CurveData,
  segmentDistance: number
): { position: Point } {
  const t = distanceToT(curveData.arcLengthTable, segmentDistance)
  const position = getPointOnBezier(curveData.bezier, t)
  return { position }
}

/**
 * Update single axle position and handle segment transitions
 *
 * @param axleState - Current axle state
 * @param axleExecution - Current execution state for this axle
 * @param path - The path being followed
 * @param velocity - Distance to move this frame
 * @param linesMap - Map of line IDs to Line objects
 * @param curveDataMap - Map of curve indices to curve data
 * @param maxOffset - Optional max offset for extending beyond path (for front axle)
 * @returns Updated axle state, execution state, and completion flag
 */
export function updateAxlePosition(
  axleState: AxleState,
  axleExecution: AxleExecutionState,
  path: PathResult,
  velocity: number,
  linesMap: Map<string, Line>,
  curveDataMap: Map<number, CurveData>,
  maxOffset?: number
): {
  axleState: AxleState
  execution: AxleExecutionState
  completed: boolean
} {
  const segment = path.segments[axleExecution.currentSegmentIndex]
  const newSegmentDistance = axleExecution.segmentDistance + velocity

  // Check segment completion
  if (newSegmentDistance >= segment.length) {
    const overflow = newSegmentDistance - segment.length
    const nextSegmentIndex = axleExecution.currentSegmentIndex + 1

    // Check path completion
    if (nextSegmentIndex >= path.segments.length) {
      // Special case: Allow front axle to extend beyond path on line segments
      // This applies to both single-segment and multi-segment paths if the last segment is a line
      if (maxOffset !== undefined && segment.type === 'line') {
        const line = linesMap.get(segment.lineId!)!
        const extendedOffset = segment.startOffset + newSegmentDistance

        // Check if we can extend to maxOffset
        if (extendedOffset <= maxOffset) {
          const extendedPosition = calculatePositionOnLine(line, extendedOffset)
          return {
            axleState: { ...axleState, ...extendedPosition },
            execution: { ...axleExecution, segmentDistance: newSegmentDistance },
            completed: false
          }
        }

        // Reached maxOffset - clamp and complete
        const finalPosition = calculatePositionOnLine(line, maxOffset)
        return {
          axleState: { ...axleState, ...finalPosition },
          execution: { ...axleExecution, segmentDistance: maxOffset - segment.startOffset },
          completed: true
        }
      }

      // Normal case: Clamp to end of path
      const finalPosition =
        segment.type === 'line'
          ? calculatePositionOnLine(
              linesMap.get(segment.lineId!)!,
              segment.endOffset
            )
          : calculatePositionOnCurve(
              curveDataMap.get(segment.curveIndex!)!,
              segment.length
            )

      return {
        axleState: { ...axleState, ...finalPosition },
        execution: { ...axleExecution, segmentDistance: segment.length },
        completed: true
      }
    }

    // Transition to next segment
    const nextSegment = path.segments[nextSegmentIndex]
    const newPosition =
      nextSegment.type === 'line'
        ? calculatePositionOnLine(
            linesMap.get(nextSegment.lineId!)!,
            nextSegment.startOffset + overflow
          )
        : calculatePositionOnCurve(
            curveDataMap.get(nextSegment.curveIndex!)!,
            overflow
          )

    return {
      axleState: { ...axleState, ...newPosition },
      execution: {
        currentSegmentIndex: nextSegmentIndex,
        segmentDistance: overflow
      },
      completed: false
    }
  }

  // Still in current segment
  const newPosition =
    segment.type === 'line'
      ? calculatePositionOnLine(
          linesMap.get(segment.lineId!)!,
          segment.startOffset + newSegmentDistance
        )
      : calculatePositionOnCurve(
          curveDataMap.get(segment.curveIndex!)!,
          newSegmentDistance
        )

  return {
    axleState: { ...axleState, ...newPosition },
    execution: { ...axleExecution, segmentDistance: newSegmentDistance },
    completed: false
  }
}

// ============================================================================
// Path Preparation
// ============================================================================

export interface PreparedPath {
  path: PathResult
  curveDataMap: Map<number, CurveData>
}

/**
 * Build curve data (bezier curves and arc-length tables) for all curve segments in a path
 */
function buildCurveDataMap(
  path: PathResult,
  curves: Curve[],
  linesMap: Map<string, Line>,
  config: MovementConfig
): Map<number, CurveData> {
  const curveDataMap = new Map<number, CurveData>()

  for (const segment of path.segments) {
    if (segment.type === 'curve' && segment.curveIndex !== undefined) {
      const curveSpec = curves[segment.curveIndex]
      if (curveSpec) {
        const fromLine = linesMap.get(curveSpec.fromLineId)
        const toLine = linesMap.get(curveSpec.toLineId)
        if (fromLine && toLine) {
          // Resolve offsets with wheelbase adjustment (matching buildGraph logic)
          const fromOffset = resolveFromLineOffset(
            fromLine,
            curveSpec.fromOffset,
            curveSpec.fromIsPercentage,
            100,
            config.wheelbase
          )
          const toOffset = resolveToLineOffset(
            toLine,
            curveSpec.toOffset,
            curveSpec.toIsPercentage,
            0,
            config.wheelbase
          )

          const bezier = createBezierCurve(
            fromLine,
            toLine,
            config,
            false, // willFlip is always false now
            {
              fromOffset: fromOffset,
              fromIsPercentage: false, // Already resolved to absolute
              toOffset: toOffset,
              toIsPercentage: false    // Already resolved to absolute
            }
          )
          const arcLengthTable = buildArcLengthTable(bezier)
          curveDataMap.set(segment.curveIndex, { bezier, arcLengthTable })
        }
      }
    }
  }

  return curveDataMap
}

/**
 * Prepare path and curve data for a goto command
 * Returns null if no path found
 *
 * @param vehicle - The vehicle to move
 * @param command - The goto command with target
 * @param ctx - Scene context with graph, linesMap, curves, and config
 * @returns PreparedPath with path and curve data, or null if no path found
 */
export function prepareCommandPath(
  vehicle: Vehicle,
  command: GotoCommand,
  ctx: SceneContext
): PreparedPath | null {
  const { graph, linesMap, curves, config } = ctx
  const targetLine = linesMap.get(command.targetLineId)
  if (!targetLine) return null

  // Calculate target offset
  // Use effective line length (lineLength - wheelbase) to ensure R (rear axle)
  // doesn't exceed the line boundary when considering the vehicle's wheelbase
  const targetLineLength = getLineLength(targetLine)
  const effectiveLineLength = targetLineLength - config.wheelbase

  // If line is too short for the vehicle's wheelbase, no valid path exists
  if (effectiveLineLength <= 0) return null

  const targetOffset = command.isPercentage
    ? (command.targetOffset / 100) * effectiveLineLength
    : Math.min(command.targetOffset, effectiveLineLength)

  // Find path from current position to target
  // Use vehicle.rear.lineId (current position) not vehicle.lineId (initial line)
  const path = findPath(
    graph,
    { lineId: vehicle.rear.lineId, offset: vehicle.rear.absoluteOffset },
    command.targetLineId,
    targetOffset,
    false
  )

  if (!path) return null

  // Build curve data for all curve segments
  const curveDataMap = buildCurveDataMap(path, curves, linesMap, config)

  return { path, curveDataMap }
}

// ============================================================================
// Segment Transition
// ============================================================================

type CommandStartCallback = (info: CommandStartInfo) => void

export interface SegmentCompletionContext {
  linesMap: Map<string, Line>
  config: MovementConfig
  vehicleQueues: Map<string, GotoCommand[]>
  curves: Curve[]
  graphRef: { current: ReturnType<typeof import('./pathFinding').buildGraph> | null }
  prepareCommandPath: (
    vehicle: Vehicle,
    command: GotoCommand,
    ctx: SceneContext
  ) => { path: PathResult; curveDataMap: Map<number, CurveData> } | null
  onCommandComplete?: GotoCompletionCallback
  onCommandStart?: CommandStartCallback
}

export interface SegmentCompletionResult {
  handled: boolean
  vehicle: Vehicle
  /** New execution state (null if completed or unchanged) */
  newExecution?: PathExecutionState | null
  /** True if vehicle is waiting for confirmation to continue */
  isWaiting?: boolean
}

/**
 * Handle arrival at destination - all segments completed (pure function)
 * Checks for next command in queue and starts it, or marks vehicle as arrived
 */
export function handleArrival(
  state: VehicleMovementState,
  ctx: SegmentCompletionContext
): SegmentCompletionResult {
  const exec = state.execution!
  const queue = ctx.vehicleQueues.get(state.vehicle.id)
  const completedCommand = queue?.[exec.currentCommandIndex]

  // 1. Fire callback if provided
  if (completedCommand && ctx.onCommandComplete) {
    ctx.onCommandComplete({
      vehicleId: state.vehicle.id,
      command: completedCommand,
      finalPosition: {
        lineId: state.vehicle.rear.lineId,
        absoluteOffset: state.vehicle.rear.absoluteOffset,
        position: state.vehicle.rear.position
      },
      payload: completedCommand.payload
    })
  }

  // 2. Check if should wait for confirmation
  if (completedCommand?.awaitConfirmation) {
    return {
      handled: true,
      vehicle: { ...state.vehicle, state: 'waiting' },
      newExecution: exec, // Keep execution state for resume
      isWaiting: true
    }
  }

  // Check if there's a next command in the queue
  const nextCommandIndex = exec.currentCommandIndex + 1

  if (queue && nextCommandIndex < queue.length) {
    // Prepare next command
    const nextCommand = queue[nextCommandIndex]
    const graph = ctx.graphRef.current
    if (graph) {
      // Vehicle is already at the arrival position (handled by updateAxlePosition)
      const sceneCtx: SceneContext = {
        graph,
        linesMap: ctx.linesMap,
        curves: ctx.curves,
        config: ctx.config
      }
      const prepared = ctx.prepareCommandPath(
        state.vehicle,
        nextCommand,
        sceneCtx
      )

      if (prepared) {
        // Calculate front axle position
        const frontPosition = calculateFrontAxlePosition(
          prepared.path,
          0,
          0,
          ctx.config.wheelbase
        )

        // Emit commandStart event
        if (ctx.onCommandStart) {
          ctx.onCommandStart({
            vehicleId: state.vehicle.id,
            command: nextCommand,
            commandIndex: nextCommandIndex,
            startPosition: {
              lineId: state.vehicle.rear.lineId,
              absoluteOffset: state.vehicle.rear.absoluteOffset,
              position: state.vehicle.rear.position
            }
          })
        }

        // Start next command - return new execution state
        const newExecution: PathExecutionState = {
          path: prepared.path,
          curveDataMap: prepared.curveDataMap,
          currentCommandIndex: nextCommandIndex,
          rear: {
            currentSegmentIndex: 0,
            segmentDistance: 0
          },
          front: frontPosition
            ? {
                currentSegmentIndex: frontPosition.segmentIndex,
                segmentDistance: frontPosition.segmentDistance
              }
            : {
                currentSegmentIndex: 0,
                segmentDistance: 0
              }
        }
        const newVehicle = { ...state.vehicle, state: 'moving' as const }
        return { handled: true, vehicle: newVehicle, newExecution }
      }
    }
  }

  // No more commands or path not found - set to idle
  const arrivedVehicle: Vehicle = {
    ...state.vehicle,
    state: 'idle'
  }
  return { handled: true, vehicle: arrivedVehicle, newExecution: null }
}

/**
 * Check if rear axle has completed all segments
 *
 * @deprecated This function has no active callers in the codebase.
 * The animation loop in useVehicleMovement uses updateAxlePosition directly
 * and checks completion via rearResult.completed flag instead.
 * This function is a candidate for removal in a future version.
 */
export function checkRearCompletion(
  state: VehicleMovementState,
  ctx: SegmentCompletionContext
): SegmentCompletionResult {
  const exec = state.execution

  if (!exec) {
    return { handled: false, vehicle: state.vehicle }
  }

  // Check if rear axle has completed path
  if (exec.rear.currentSegmentIndex >= exec.path.segments.length) {
    return handleArrival(state, ctx)
  }

  return { handled: false, vehicle: state.vehicle }
}

export type { VehicleMovementState as SegmentVehicleState }
