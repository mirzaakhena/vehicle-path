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
 * const state = engine.initializeVehicle('line-1', 0)
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
import type { AxleState } from './types/vehicle'
import type { MovementConfig, CurveData, AxleExecutionState } from './types/movement'
import type { PathResult, Graph } from './algorithms/pathFinding'
import type { TangentMode } from './types/config'
import { buildGraph } from './algorithms/pathFinding'
import {
  moveVehicle,
  prepareCommandPath,
  calculateInitialFrontPosition,
  getLineLength,
  getPositionFromOffset
} from './algorithms/vehicleMovement'

// =============================================================================
// Types
// =============================================================================

export interface PathEngineConfig {
  wheelbase: number
  tangentMode: TangentMode
}

/**
 * Simplified dual-axle position state for use with PathEngine.
 * A flatter alternative to the internal Vehicle type.
 */
export interface VehiclePathState {
  rear: { lineId: string; offset: number; position: Point }
  front: { lineId: string; offset: number; position: Point }
}

/**
 * Active path execution state for a vehicle in motion.
 * Returned by preparePath() and updated by moveVehicle() each tick.
 */
export interface PathExecution {
  path: PathResult
  curveDataMap: Map<number, CurveData>
  rearSegmentIndex: number
  rearSegmentDistance: number
  frontSegmentIndex: number
  frontSegmentDistance: number
  /** Resolved absolute target offset for rear axle arrival detection */
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
      wheelbase: engineConfig.wheelbase,
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
   * Initialize a vehicle's dual-axle position on a line.
   *
   * @param lineId - The line to place the vehicle on
   * @param offset - Absolute distance offset along the line
   * @returns Initial VehiclePathState, or null if lineId does not exist
   */
  initializeVehicle(lineId: string, offset: number): VehiclePathState | null {
    const line = this.linesMap.get(lineId)
    if (!line) return null

    const lineLen = getLineLength(line)
    const rearOffset = Math.min(offset, lineLen - this.config.wheelbase)
    const rearPos = getPositionFromOffset(line, rearOffset)
    const front = calculateInitialFrontPosition(lineId, rearOffset, this.config.wheelbase, line)

    return {
      rear: { lineId, offset: rearOffset, position: rearPos },
      front: { lineId: front.lineId, offset: front.absoluteOffset, position: front.position }
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

    // Build a minimal Vehicle object to reuse prepareCommandPath
    const vehicle = {
      id: '_engine_temp',
      lineId: vehicleState.rear.lineId,
      offset: vehicleState.rear.offset,
      isPercentage: false,
      state: 'idle' as const,
      rear: {
        lineId: vehicleState.rear.lineId,
        position: vehicleState.rear.position,
        absoluteOffset: vehicleState.rear.offset
      },
      front: {
        lineId: vehicleState.front.lineId,
        position: vehicleState.front.position,
        absoluteOffset: vehicleState.front.offset
      }
    }

    const command = {
      vehicleId: '_engine_temp',
      targetLineId,
      targetOffset,
      isPercentage
    }

    const ctx = {
      graph: this.graph,
      linesMap: this.linesMap,
      curves: this.curves,
      config: this.config
    }

    const result = prepareCommandPath(vehicle, command, ctx)
    if (!result) return null

    // Resolve the actual target offset the rear axle will stop at
    // (mirrors the logic inside prepareCommandPath)
    let actualTargetOffset = targetOffset
    const targetLine = this.linesMap.get(targetLineId)
    if (targetLine) {
      const lineLen = getLineLength(targetLine)
      const effectiveLen = Math.max(0, lineLen - this.config.wheelbase)
      actualTargetOffset = isPercentage
        ? targetOffset * effectiveLen
        : Math.min(targetOffset, effectiveLen)
    }

    return {
      path: result.path,
      curveDataMap: result.curveDataMap,
      rearSegmentIndex: 0,
      rearSegmentDistance: 0,
      frontSegmentIndex: 0,
      frontSegmentDistance: this.config.wheelbase,
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
    const rear: AxleState = {
      lineId: state.rear.lineId,
      position: state.rear.position,
      absoluteOffset: state.rear.offset
    }
    const front: AxleState = {
      lineId: state.front.lineId,
      position: state.front.position,
      absoluteOffset: state.front.offset
    }
    const rearExec: AxleExecutionState = {
      currentSegmentIndex: execution.rearSegmentIndex,
      segmentDistance: execution.rearSegmentDistance
    }
    const frontExec: AxleExecutionState = {
      currentSegmentIndex: execution.frontSegmentIndex,
      segmentDistance: execution.frontSegmentDistance
    }

    const result = moveVehicle(rear, front, rearExec, frontExec, execution.path, distance, this.linesMap, execution.curveDataMap)

    return {
      state: {
        rear: { lineId: result.rear.lineId, offset: result.rear.absoluteOffset, position: result.rear.position },
        front: { lineId: result.front.lineId, offset: result.front.absoluteOffset, position: result.front.position }
      },
      execution: {
        ...execution,
        rearSegmentIndex: result.rearExecution.currentSegmentIndex,
        rearSegmentDistance: result.rearExecution.segmentDistance,
        frontSegmentIndex: result.frontExecution.currentSegmentIndex,
        frontSegmentDistance: result.frontExecution.segmentDistance
      },
      arrived: result.arrived
    }
  }
}
