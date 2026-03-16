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
 * const engine = new PathEngine({ tangentMode: 'proportional-40' })
 *
 * engine.setScene(lines, curves)
 *
 * const state = engine.initializeVehicle('line-1', 0, { axleSpacings: [40] })
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

import type { Line, Curve, BezierCurve, Point } from './types/geometry'
import type { AxleState, VehicleDefinition } from './types/vehicle'
import type { MovementConfig, CurveData, AxleExecutionState } from './types/movement'
import type { PathResult, Graph } from './algorithms/pathFinding'
import type { TangentMode } from './types/config'
import { buildGraph, findPath } from './algorithms/pathFinding'
import {
  moveVehicle,
  prepareCommandPath,
  calculateInitialAxlePositions,
  getLineLength
} from './algorithms/vehicleMovement'
import {
  moveVehicleWithAcceleration as moveVehicleWithAccelerationFn,
  type AccelerationConfig,
  type AccelerationState
} from './algorithms/acceleration'

// =============================================================================
// Types
// =============================================================================

export interface PathEngineConfig {
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
  private graphDirty = true
  private linesMap = new Map<string, Line>()
  private curvesMap = new Map<string, Curve>()
  private curveSeq = 0
  private config: MovementConfig

  constructor(engineConfig: PathEngineConfig) {
    this.config = {
      tangentMode: engineConfig.tangentMode
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private ensureGraph(): Graph {
    if (this.graphDirty || !this.graph) {
      this.graph = buildGraph(
        Array.from(this.linesMap.values()),
        Array.from(this.curvesMap.values()),
        this.config
      )
      this.graphDirty = false
    }
    return this.graph
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
    return Array.from(this.curvesMap.values())
  }

  /**
   * Expose the graph (lazily built) for consumers that need it
   * (e.g., scene stats, custom pathfinding).
   */
  getGraph(): Graph {
    return this.ensureGraph()
  }

  /**
   * Returns computed bezier for each curve by id.
   * Internally calls ensureGraph() to guarantee beziers are computed,
   * then iterates graph edges to build the return map.
   */
  getCurveBeziers(): Map<string, BezierCurve> {
    const graph = this.ensureGraph()
    const result = new Map<string, BezierCurve>()
    for (const edges of graph.adjacency.values()) {
      for (const edge of edges) {
        if (edge.curveId) {
          result.set(edge.curveId, edge.bezier)
        }
      }
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Scene management
  // ---------------------------------------------------------------------------

  /**
   * Replace the entire scene. Graph is rebuilt lazily on first access.
   */
  setScene(lines: Line[], curves: Curve[]): void {
    this.linesMap.clear()
    for (const line of lines) {
      this.linesMap.set(line.id, line)
    }
    this.curvesMap.clear()
    this.curveSeq = 0
    for (const curve of curves) {
      const id = curve.id ?? `curve-${++this.curveSeq}`
      this.curvesMap.set(id, { ...curve, id })
    }
    this.graph = null
    this.graphDirty = true
  }

  /**
   * Add a single line. Returns false if a line with the same ID already exists.
   */
  addLine(line: Line): boolean {
    if (this.linesMap.has(line.id)) return false
    this.linesMap.set(line.id, line)
    this.graphDirty = true
    return true
  }

  /**
   * Update start and/or end coordinates of an existing line.
   * Immutable — does not mutate the original line object.
   */
  updateLine(lineId: string, updates: { start?: Point; end?: Point }): boolean {
    const line = this.linesMap.get(lineId)
    if (!line) return false
    this.linesMap.set(lineId, { ...line, ...updates })
    this.graphDirty = true
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
   * Immutable — does not mutate original objects.
   */
  renameLine(oldId: string, newId: string): { success: boolean; error?: string; renamedCurveIds?: string[] } {
    const trimmed = newId.trim()
    if (!trimmed) return { success: false, error: 'Name cannot be empty' }
    if (trimmed === oldId) return { success: true }
    if (this.linesMap.has(trimmed)) return { success: false, error: `"${trimmed}" already exists` }

    const line = this.linesMap.get(oldId)
    if (!line) return { success: false, error: `Line "${oldId}" not found` }

    // Immutable: create new line object
    this.linesMap.delete(oldId)
    this.linesMap.set(trimmed, { ...line, id: trimmed })

    // Cascade: immutably update curves
    const renamedCurveIds: string[] = []
    for (const [curveId, curve] of this.curvesMap) {
      let changed = false
      const updated = { ...curve }
      if (curve.fromLineId === oldId) { updated.fromLineId = trimmed; changed = true }
      if (curve.toLineId === oldId) { updated.toLineId = trimmed; changed = true }
      if (changed) {
        this.curvesMap.set(curveId, updated)
        renamedCurveIds.push(curveId)
      }
    }

    this.graphDirty = true
    return { success: true, renamedCurveIds }
  }

  /**
   * Remove a line and all curves connected to it.
   * Returns which curves were also removed.
   */
  removeLine(lineId: string): { success: boolean; removedCurveIds: string[] } {
    if (!this.linesMap.has(lineId)) return { success: false, removedCurveIds: [] }
    this.linesMap.delete(lineId)

    const removedCurveIds: string[] = []
    for (const [curveId, curve] of this.curvesMap) {
      if (curve.fromLineId === lineId || curve.toLineId === lineId) {
        removedCurveIds.push(curveId)
      }
    }
    for (const id of removedCurveIds) {
      this.curvesMap.delete(id)
    }

    this.graphDirty = true
    return { success: true, removedCurveIds }
  }

  /**
   * Add a directional curve (connection) from one line to another.
   * Returns the curve id (auto-generated if not provided).
   */
  addCurve(curve: Curve): string {
    const id = curve.id ?? `curve-${++this.curveSeq}`
    this.curvesMap.set(id, { ...curve, id })
    this.graphDirty = true
    return id
  }

  /**
   * Update a curve by id. Returns false if curve not found.
   */
  updateCurve(curveId: string, updates: Partial<Curve>): boolean {
    const curve = this.curvesMap.get(curveId)
    if (!curve) return false
    this.curvesMap.set(curveId, { ...curve, ...updates, id: curveId })
    this.graphDirty = true
    return true
  }

  /**
   * Remove a curve by id. Returns false if curve not found.
   */
  removeCurve(curveId: string): boolean {
    if (!this.curvesMap.has(curveId)) return false
    this.curvesMap.delete(curveId)
    this.graphDirty = true
    return true
  }

  // ---------------------------------------------------------------------------
  // Path validation
  // ---------------------------------------------------------------------------

  /**
   * Check if a path exists from one position to another.
   * Both offsets are absolute pixel values.
   */
  canReach(fromLineId: string, fromOffset: number, toLineId: string, toOffset: number): boolean {
    const graph = this.ensureGraph()
    return findPath(graph, { lineId: fromLineId, offset: fromOffset }, toLineId, toOffset) !== null
  }

  // ---------------------------------------------------------------------------
  // Vehicle operations
  // ---------------------------------------------------------------------------

  /**
   * Initialize a vehicle's N-axle position on a line.
   *
   * @param lineId - The line to place the vehicle on
   * @param rearOffset - Absolute distance offset untuk axle paling belakang
   * @param vehicle - VehicleDefinition (or any object extending it with axleSpacings)
   * @returns Initial VehiclePathState, or null if lineId does not exist
   * @throws if axleSpacings is empty
   */
  initializeVehicle(lineId: string, rearOffset: number, vehicle: VehicleDefinition): VehiclePathState | null {
    const line = this.linesMap.get(lineId)
    if (!line) return null

    const { axleSpacings } = vehicle
    if (axleSpacings.length === 0) {
      throw new Error('initializeVehicle: axleSpacings must have at least one entry (vehicle needs ≥2 axles)')
    }
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
    const graph = this.ensureGraph()

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
      graph,
      linesMap: this.linesMap,
      curves: Array.from(this.curvesMap.values()),
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

  /**
   * Advance a vehicle with physics-based acceleration/deceleration.
   *
   * Thin wrapper — internally calls the standalone moveVehicleWithAcceleration()
   * function from acceleration.ts, injecting this.linesMap as the 6th argument.
   */
  moveVehicleWithAcceleration(
    state: VehiclePathState,
    execution: PathExecution,
    accelState: AccelerationState,
    config: AccelerationConfig,
    deltaTime: number
  ): { state: VehiclePathState; execution: PathExecution; accelState: AccelerationState; arrived: boolean } {
    return moveVehicleWithAccelerationFn(state, execution, accelState, config, deltaTime, this.linesMap)
  }
}
