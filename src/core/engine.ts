/**
 * PathEngine - Imperative, framework-agnostic vehicle simulation engine
 *
 * This module provides a class-based API over the vehicle-path core algorithms.
 * Use this when you need stateful scene/vehicle management outside of React
 * (e.g. game loops, Three.js useFrame, server-side simulations).
 *
 * @example
 * ```typescript
 * import { PathEngine } from 'vehicle-path/core'
 *
 * const engine = new PathEngine({ wheelbase: 30, tangentMode: 'proportional-40' })
 *
 * engine.setScene(lines, curves)
 *
 * const state = engine.initializeVehicle('line-1', 0, [40])
 * const execution = engine.preparePath(state, 'line-3', 1.0, true)
 *
 * // In your animation/game loop:
 * function tick(deltaTime: number) {
 *   const result = engine.moveVehicle(state, execution, speed * deltaTime)
 *   state = result.state
 *   execution = result.execution
 *   if (result.arrived) { ... }
 * }
 * ```
 */

import type { Line, Curve, Point } from './types/geometry'
import type { AxleState, VehicleDefinition } from './types/vehicle'
import type { MovementConfig, CurveData, AxleExecutionState } from './types/movement'
import type { PathResult, Graph } from './algorithms/pathFinding'
import type { TangentMode } from './types/config'
import { buildGraph } from './algorithms/pathFinding'
import {
  moveVehicle,
  prepareCommandPath,
  calculateInitialAxlePositions,
  getLineLength
} from './algorithms/vehicleMovement'

// =============================================================================
// Types
// =============================================================================

export interface PathEngineConfig {
  maxWheelbase: number
  tangentMode: TangentMode
}

/**
 * Multi-axle position state for use with PathEngine.
 * axles[0] = terdepan, axles[N-1] = paling belakang.
 */
export interface VehiclePathState extends VehicleDefinition {
  axles: Array<{ lineId: string; offset: number; position: Point }>
}

/**
 * Active path execution state for a vehicle in motion.
 * Returned by preparePath() and updated by moveVehicle() each tick.
 */
export interface PathExecution {
  path: PathResult
  curveDataMap: Map<number, CurveData>
  /** Execution state per axle, sesuai urutan VehiclePathState.axles */
  axleExecutions: Array<{ segmentIndex: number; segmentDistance: number }>
  targetLineId: string
  targetOffset: number
}

// Re-export moveVehicle so consumers can import from the same module
export { moveVehicle } from './algorithms/vehicleMovement'

// =============================================================================
// PathEngine class
// =============================================================================

/**
 * Stateful, imperative vehicle simulation engine.
 *
 * Manages a scene (lines + curves + graph) and provides methods to
 * initialize vehicles, prepare paths, and advance movement per tick.
 *
 * Designed for framework-agnostic use — no React, no render dependencies.
 * The caller is responsible for the animation loop and state storage.
 */
export class PathEngine {
  private graph: Graph | null = null
  private linesMap = new Map<string, Line>()
  private curves: Curve[] = []
  private config: MovementConfig

  constructor(engineConfig: PathEngineConfig) {
    this.config = {
      maxWheelbase: engineConfig.maxWheelbase,
      tangentMode: engineConfig.tangentMode
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get movementConfig(): MovementConfig {
    return this.config
  }

  get lines(): Line[] {
    return Array.from(this.linesMap.values())
  }

  getCurves(): Curve[] {
    return this.curves
  }

  // ---------------------------------------------------------------------------
  // Scene management
  // ---------------------------------------------------------------------------

  /**
   * Replace the entire scene and rebuild the graph.
   */
  setScene(lines: Line[], curves: Curve[]): void {
    this.linesMap.clear()
    for (const line of lines) {
      this.linesMap.set(line.id, line)
    }
    this.curves = curves
    this.graph = buildGraph(lines, curves, this.config)
  }

  /**
   * Add a single line. Returns false if a line with the same ID already exists.
   */
  addLine(line: Line): boolean {
    if (this.linesMap.has(line.id)) return false
    this.linesMap.set(line.id, line)
    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
    return true
  }

  /**
   * Update start and/or end coordinates of an existing line.
   */
  updateLine(lineId: string, updates: { start?: Point; end?: Point }): boolean {
    const line = this.linesMap.get(lineId)
    if (!line) return false
    if (updates.start) line.start = updates.start
    if (updates.end) line.end = updates.end
    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
    return true
  }

  /**
   * Update a single endpoint ('start' or 'end') of a line.
   */
  updateLineEndpoint(lineId: string, endpoint: 'start' | 'end', point: Point): boolean {
    return this.updateLine(lineId, { [endpoint]: point })
  }

  /**
   * Rename a line ID and cascade the change to all connected curves.
   */
  renameLine(oldId: string, newId: string): { success: boolean; error?: string } {
    const trimmed = newId.trim()
    if (!trimmed) return { success: false, error: 'Name cannot be empty' }
    if (trimmed === oldId) return { success: true }
    if (this.linesMap.has(trimmed)) return { success: false, error: `"${trimmed}" already exists` }

    const line = this.linesMap.get(oldId)
    if (!line) return { success: false, error: `Line "${oldId}" not found` }

    line.id = trimmed
    this.linesMap.delete(oldId)
    this.linesMap.set(trimmed, line)

    // Cascade: update all curves that reference the old ID
    for (const curve of this.curves) {
      if (curve.fromLineId === oldId) curve.fromLineId = trimmed
      if (curve.toLineId === oldId) curve.toLineId = trimmed
    }

    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
    return { success: true }
  }

  /**
   * Remove a line and all curves connected to it.
   */
  removeLine(lineId: string): boolean {
    if (!this.linesMap.has(lineId)) return false
    this.linesMap.delete(lineId)
    this.curves = this.curves.filter(c => c.fromLineId !== lineId && c.toLineId !== lineId)
    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
    return true
  }

  /**
   * Add a directional curve (connection) from one line to another.
   */
  addCurve(curve: Curve): void {
    this.curves.push(curve)
    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
  }

  /**
   * Update a curve by index. Returns false if index is out of bounds.
   */
  updateCurve(index: number, updates: Partial<Curve>): boolean {
    if (index < 0 || index >= this.curves.length) return false
    this.curves[index] = { ...this.curves[index], ...updates }
    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
    return true
  }

  /**
   * Remove a curve by index. Returns false if index is out of bounds.
   */
  removeCurve(index: number): boolean {
    if (index < 0 || index >= this.curves.length) return false
    this.curves.splice(index, 1)
    this.graph = buildGraph(Array.from(this.linesMap.values()), this.curves, this.config)
    return true
  }

  // ---------------------------------------------------------------------------
  // Vehicle operations
  // ---------------------------------------------------------------------------

  /**
   * Initialize a vehicle's N-axle position on a line.
   *
   * @param lineId - The line to place the vehicle on
   * @param rearOffset - Absolute distance offset untuk axle paling belakang
   * @param axleSpacings - Jarak antar axle berurutan (N-1 nilai untuk N axle)
   * @returns Initial VehiclePathState, or null if lineId does not exist
   */
  initializeVehicle(lineId: string, rearOffset: number, axleSpacings: number[]): VehiclePathState | null {
    const line = this.linesMap.get(lineId)
    if (!line) return null

    const totalVehicleLength = axleSpacings.reduce((a, b) => a + b, 0)
    const lineLen = getLineLength(line)
    const clampedRear = Math.min(rearOffset, lineLen - totalVehicleLength)
    const axleStates = calculateInitialAxlePositions(lineId, clampedRear, axleSpacings, line)

    return {
      axles: axleStates.map(a => ({ lineId: a.lineId, offset: a.absoluteOffset, position: a.position })),
      axleSpacings
    }
  }

  /**
   * Prepare a path from the vehicle's current position to a target.
   *
   * Must be called before moveVehicle(). Returns null if no path exists.
   *
   * @param vehicleState - Current vehicle state (from initializeVehicle or previous tick)
   * @param targetLineId - ID of the target line
   * @param targetOffset - Position on the target line
   * @param isPercentage - If true, targetOffset is 0-1 fraction; if false, absolute distance
   */
  preparePath(
    vehicleState: VehiclePathState,
    targetLineId: string,
    targetOffset: number,
    isPercentage: boolean = false
  ): PathExecution | null {
    if (!this.graph) return null

    const totalVehicleLength = vehicleState.axleSpacings.reduce((a, b) => a + b, 0)
    const rearmost = vehicleState.axles[vehicleState.axles.length - 1]

    // Build minimal Vehicle untuk prepareCommandPath
    const vehicle = {
      id: '_engine_temp',
      lineId: rearmost.lineId,
      offset: rearmost.offset,
      isPercentage: false,
      state: 'idle' as const,
      axles: vehicleState.axles.map(a => ({
        lineId: a.lineId,
        position: a.position,
        absoluteOffset: a.offset
      })),
      axleSpacings: vehicleState.axleSpacings
    }

    const result = prepareCommandPath(vehicle, {
      vehicleId: '_engine_temp',
      targetLineId,
      targetOffset,
      isPercentage
    }, {
      graph: this.graph,
      linesMap: this.linesMap,
      curves: this.curves,
      config: this.config
    })
    if (!result) return null

    // Resolve actual target offset (mirrors logic di prepareCommandPath)
    let actualTargetOffset = targetOffset
    const targetLine = this.linesMap.get(targetLineId)
    if (targetLine) {
      const effectiveLen = Math.max(0, getLineLength(targetLine) - totalVehicleLength)
      actualTargetOffset = isPercentage
        ? targetOffset * effectiveLen
        : Math.min(targetOffset, effectiveLen)
    }

    // axles[0] (front) mulai di totalVehicleLength dalam path
    // axles[k] mulai di totalVehicleLength - sum(axleSpacings[0..k-1])
    let cumulative = 0
    const axleExecutions: Array<{ segmentIndex: number; segmentDistance: number }> = [
      { segmentIndex: 0, segmentDistance: totalVehicleLength } // axles[0] = front
    ]
    for (let i = 0; i < vehicleState.axleSpacings.length; i++) {
      cumulative += vehicleState.axleSpacings[i]
      axleExecutions.push({ segmentIndex: 0, segmentDistance: totalVehicleLength - cumulative })
    }

    return {
      path: result.path,
      curveDataMap: result.curveDataMap,
      axleExecutions,
      targetLineId,
      targetOffset: actualTargetOffset
    }
  }

  /**
   * Advance a vehicle by `distance` along its prepared path.
   *
   * Call this every tick. The returned `state` and `execution` replace the
   * previous values. When `arrived` is true, the vehicle has reached the target.
   *
   * @param state - Current vehicle state
   * @param execution - Current path execution (from preparePath or previous tick)
   * @param distance - Distance to advance this tick (speed × deltaTime)
   */
  moveVehicle(
    state: VehiclePathState,
    execution: PathExecution,
    distance: number
  ): { state: VehiclePathState; execution: PathExecution; arrived: boolean } {
    const axleStates: AxleState[] = state.axles.map(a => ({
      lineId: a.lineId,
      position: a.position,
      absoluteOffset: a.offset
    }))
    const axleExecs: AxleExecutionState[] = execution.axleExecutions.map(e => ({
      currentSegmentIndex: e.segmentIndex,
      segmentDistance: e.segmentDistance
    }))

    const result = moveVehicle(axleStates, axleExecs, execution.path, distance, this.linesMap, execution.curveDataMap)

    return {
      state: {
        axles: result.axles.map(a => ({ lineId: a.lineId, offset: a.absoluteOffset, position: a.position })),
        axleSpacings: state.axleSpacings
      },
      execution: {
        ...execution,
        axleExecutions: result.axleExecutions.map(e => ({
          segmentIndex: e.currentSegmentIndex,
          segmentDistance: e.segmentDistance
        }))
      },
      arrived: result.arrived
    }
  }
}
