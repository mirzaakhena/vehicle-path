import { describe, it, expect } from 'vitest'
import {
  getCumulativeArcLength,
  arcLengthToSegmentPosition,
  calculateFrontAxlePosition,
  initializeMovingVehicle,
  createInitialMovementState,
  initializeAllVehicles,
  calculatePositionOnLine,
  calculatePositionOnCurve,
  updateAxlePosition,
  prepareCommandPath,
  calculateInitialFrontPosition
} from '../vehicleMovement'
import { buildGraph } from '../pathFinding'
import { buildArcLengthTable } from '../math'
import type { PathResult, PathSegment } from '../pathFinding'
import type { Vehicle, GotoCommand, AxleState } from '../types/vehicle'
import type { Line, Curve, BezierCurve } from '../types/geometry'
import type { AxleExecutionState, CurveData, MovementConfig, SceneContext } from '../types/movement'

// =============================================================================
// Test Helpers
// =============================================================================

function createMockPath(segmentLengths: number[]): PathResult {
  const segments = segmentLengths.map((length, index) => ({
    type: 'line' as const,
    lineId: `line${index}`,
    startOffset: 0,
    endOffset: length,
    length
  }))

  return {
    segments,
    totalDistance: segmentLengths.reduce((sum, len) => sum + len, 0)
  }
}

function createLine(id: string, x1: number, y1: number, x2: number, y2: number): Line {
  return { id, start: { x: x1, y: y1 }, end: { x: x2, y: y2 } }
}

function createMockLine(id: string, start: { x: number; y: number }, end: { x: number; y: number }): Line {
  return { id, start, end }
}

function getLineLength(line: Line): number {
  return Math.sqrt(
    Math.pow(line.end.x - line.start.x, 2) +
    Math.pow(line.end.y - line.start.y, 2)
  )
}

function getPositionOnLine(line: Line, offset: number) {
  const length = getLineLength(line)
  const t = offset / length
  return {
    x: line.start.x + (line.end.x - line.start.x) * t,
    y: line.start.y + (line.end.y - line.start.y) * t
  }
}

function createBezierCurve(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): BezierCurve {
  return { p0, p1, p2, p3 }
}

function createCurveData(bezier: BezierCurve): CurveData {
  return {
    bezier,
    arcLengthTable: buildArcLengthTable(bezier)
  }
}

function createAxleState(lineId: string, x: number, y: number, offset: number): AxleState {
  return {
    lineId,
    position: { x, y },
    absoluteOffset: offset
  }
}

function createAxleExecution(segmentIndex: number, segmentDistance: number): AxleExecutionState {
  return {
    currentSegmentIndex: segmentIndex,
    segmentDistance
  }
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

function createMockVehicle(overrides: DeepPartial<Vehicle> = {}): Vehicle {
  const defaultVehicle: Vehicle = {
    id: 'v1',
    lineId: 'line1',
    offset: 10,
    isPercentage: false,
    state: 'idle',
    rear: {
      lineId: 'line1',
      position: { x: 0, y: 0 },
      absoluteOffset: 10
    },
    front: {
      lineId: 'line1',
      position: { x: 0, y: 0 },
      absoluteOffset: 10
    }
  }

  return {
    ...defaultVehicle,
    ...overrides,
    rear: { ...defaultVehicle.rear, ...overrides.rear },
    front: { ...defaultVehicle.front, ...overrides.front }
  } as Vehicle
}

function createGotoCommand(overrides: Partial<GotoCommand> = {}): GotoCommand {
  return {
    vehicleId: 'v1',
    targetLineId: 'line1',
    targetOffset: 100,
    isPercentage: false,
    ...overrides
  }
}

const defaultConfig: MovementConfig = {
  wheelbase: 15,
  tangentMode: 'proportional-40'
}

function createSceneContext(
  lines: Line[],
  curves: Curve[] = [],
  config: MovementConfig = defaultConfig
): SceneContext {
  const linesMap = new Map(lines.map(l => [l.id, l]))
  const graph = buildGraph(lines, curves, config)
  return { graph, linesMap, curves, config }
}

// =============================================================================
// Arc Length Tracking Tests
// =============================================================================

describe('arcLengthTracking', () => {
  describe('getCumulativeArcLength', () => {
    it('should calculate cumulative arc-length from start of path', () => {
      const path = createMockPath([100, 50, 75])

      expect(getCumulativeArcLength(path, 0, 0)).toBe(0)
      expect(getCumulativeArcLength(path, 0, 50)).toBe(50)
      expect(getCumulativeArcLength(path, 0, 100)).toBe(100)
      expect(getCumulativeArcLength(path, 1, 0)).toBe(100)
      expect(getCumulativeArcLength(path, 1, 25)).toBe(125)
      expect(getCumulativeArcLength(path, 2, 0)).toBe(150)
      expect(getCumulativeArcLength(path, 2, 75)).toBe(225)
    })

    it('should handle single segment path', () => {
      const path = createMockPath([100])

      expect(getCumulativeArcLength(path, 0, 0)).toBe(0)
      expect(getCumulativeArcLength(path, 0, 50)).toBe(50)
      expect(getCumulativeArcLength(path, 0, 100)).toBe(100)
    })
  })

  describe('arcLengthToSegmentPosition', () => {
    it('should convert arc-length to segment position', () => {
      const path = createMockPath([100, 50, 75])

      expect(arcLengthToSegmentPosition(path, 0)).toEqual({ segmentIndex: 0, segmentDistance: 0 })
      expect(arcLengthToSegmentPosition(path, 50)).toEqual({ segmentIndex: 0, segmentDistance: 50 })
      expect(arcLengthToSegmentPosition(path, 100)).toEqual({ segmentIndex: 1, segmentDistance: 0 })
      expect(arcLengthToSegmentPosition(path, 125)).toEqual({ segmentIndex: 1, segmentDistance: 25 })
      expect(arcLengthToSegmentPosition(path, 150)).toEqual({ segmentIndex: 2, segmentDistance: 0 })
      expect(arcLengthToSegmentPosition(path, 225)).toEqual({ segmentIndex: 2, segmentDistance: 75 })
    })

    it('should return null when arc-length exceeds path length', () => {
      const path = createMockPath([100, 50])
      expect(arcLengthToSegmentPosition(path, 200)).toBeNull()
    })

    it('should handle single segment path', () => {
      const path = createMockPath([100])

      expect(arcLengthToSegmentPosition(path, 0)).toEqual({ segmentIndex: 0, segmentDistance: 0 })
      expect(arcLengthToSegmentPosition(path, 50)).toEqual({ segmentIndex: 0, segmentDistance: 50 })
      expect(arcLengthToSegmentPosition(path, 100)).toEqual({ segmentIndex: 0, segmentDistance: 100 })
      expect(arcLengthToSegmentPosition(path, 150)).toBeNull()
    })
  })

  describe('calculateFrontAxlePosition', () => {
    it('should calculate front axle position with wheelbase ahead of rear', () => {
      const path = createMockPath([100, 50, 75])
      const wheelbase = 30

      expect(calculateFrontAxlePosition(path, 0, 0, wheelbase)).toEqual({ segmentIndex: 0, segmentDistance: 30 })
      expect(calculateFrontAxlePosition(path, 0, 50, wheelbase)).toEqual({ segmentIndex: 0, segmentDistance: 80 })
      expect(calculateFrontAxlePosition(path, 0, 90, wheelbase)).toEqual({ segmentIndex: 1, segmentDistance: 20 })
      expect(calculateFrontAxlePosition(path, 1, 20, wheelbase)).toEqual({ segmentIndex: 2, segmentDistance: 0 })
      expect(calculateFrontAxlePosition(path, 1, 40, wheelbase)).toEqual({ segmentIndex: 2, segmentDistance: 20 })
    })

    it('should return null when front axle exceeds path length', () => {
      const path = createMockPath([100, 50])
      const wheelbase = 30
      expect(calculateFrontAxlePosition(path, 1, 30, wheelbase)).toBeNull()
    })

    it('should handle F and R in same segment', () => {
      const path = createMockPath([100])
      const wheelbase = 20
      expect(calculateFrontAxlePosition(path, 0, 30, wheelbase)).toEqual({ segmentIndex: 0, segmentDistance: 50 })
    })

    it('should handle F and R in different segments', () => {
      const path = createMockPath([50, 50, 50])
      const wheelbase = 60
      expect(calculateFrontAxlePosition(path, 0, 40, wheelbase)).toEqual({ segmentIndex: 2, segmentDistance: 0 })
    })

    it('should handle wheelbase equal to segment length', () => {
      const path = createMockPath([50, 50, 50])
      const wheelbase = 50
      expect(calculateFrontAxlePosition(path, 0, 0, wheelbase)).toEqual({ segmentIndex: 1, segmentDistance: 0 })
    })
  })
})

// =============================================================================
// Initialize Tests
// =============================================================================

describe('initialize', () => {
  describe('initializeMovingVehicle', () => {
    it('should convert Vehicle to Vehicle with absolute offset', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const vehicle = createMockVehicle({
        id: 'v1',
        lineId: 'line1',
        offset: 25,
        isPercentage: false,
        rear: {
          lineId: 'line1',
          position: { x: 25, y: 0 },
          absoluteOffset: 25
        },
        front: {
          lineId: 'line1',
          position: { x: 85, y: 0 },
          absoluteOffset: 85
        }
      })

      const result = initializeMovingVehicle(vehicle, line)

      expect(result.id).toBe('v1')
      expect(result.lineId).toBe('line1')
      expect(result.state).toBe('idle')
      expect(result.rear.absoluteOffset).toBe(25)
      expect(result.front.absoluteOffset).toBe(85)
    })

    it('should preserve original vehicle properties', () => {
      const vehicle = createMockVehicle({ id: 'custom-id' })
      const line = createLine('line1', 0, 0, 100, 0)

      const result = initializeMovingVehicle(vehicle, line)

      expect(result.id).toBe('custom-id')
    })
  })

  describe('createInitialMovementState', () => {
    it('should create initial movement state with all default values', () => {
      const vehicle = createMockVehicle()
      const state = createInitialMovementState(vehicle)

      expect(state.vehicle).toBe(vehicle)
      expect(state.execution).toBeNull()
    })
  })

  describe('initializeAllVehicles', () => {
    it('should initialize all vehicles and create state map', () => {
      const vehicles = [
        createMockVehicle({ id: 'v1', lineId: 'line1', offset: 10 }),
        createMockVehicle({ id: 'v2', lineId: 'line2', offset: 20 })
      ]
      const linesMap = new Map([
        ['line1', createLine('line1', 0, 0, 100, 0)],
        ['line2', createLine('line2', 0, 0, 100, 0)]
      ])

      const result = initializeAllVehicles(vehicles, linesMap)

      expect(result.movingVehicles).toHaveLength(2)
      expect(result.stateMap.size).toBe(2)
      expect(result.stateMap.get('v1')).toBeDefined()
      expect(result.stateMap.get('v2')).toBeDefined()
    })

    it('should skip vehicles whose line is not found', () => {
      const vehicles = [
        createMockVehicle({ id: 'v1', lineId: 'line1' }),
        createMockVehicle({ id: 'v2', lineId: 'nonexistent' })
      ]
      const linesMap = new Map([['line1', createLine('line1', 0, 0, 100, 0)]])

      const result = initializeAllVehicles(vehicles, linesMap)

      expect(result.movingVehicles).toHaveLength(1)
      expect(result.stateMap.size).toBe(1)
      expect(result.movingVehicles[0].id).toBe('v1')
    })

    it('should return empty arrays when no vehicles', () => {
      const result = initializeAllVehicles([], new Map())

      expect(result.movingVehicles).toHaveLength(0)
      expect(result.stateMap.size).toBe(0)
    })
  })
})

// =============================================================================
// Position Update Tests
// =============================================================================

describe('calculatePositionOnLine', () => {
  it('should calculate position at start of line (offset 0)', () => {
    const line = createLine('line1', 0, 0, 100, 0)
    const result = calculatePositionOnLine(line, 0)

    expect(result.lineId).toBe('line1')
    expect(result.absoluteOffset).toBe(0)
    expect(result.position.x).toBeCloseTo(0)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('should calculate position at end of line', () => {
    const line = createLine('line1', 0, 0, 100, 0)
    const result = calculatePositionOnLine(line, 100)

    expect(result.position.x).toBeCloseTo(100)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('should calculate position at midpoint', () => {
    const line = createLine('line1', 0, 0, 100, 0)
    const result = calculatePositionOnLine(line, 50)

    expect(result.position.x).toBeCloseTo(50)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('should handle diagonal lines', () => {
    const line = createLine('line1', 0, 0, 100, 100)
    const lineLength = getLineLength(line)
    const result = calculatePositionOnLine(line, lineLength / 2)

    expect(result.position.x).toBeCloseTo(50)
    expect(result.position.y).toBeCloseTo(50)
  })
})

describe('calculatePositionOnCurve', () => {
  it('should calculate position at start of curve (distance 0)', () => {
    const bezier = createBezierCurve(
      { x: 0, y: 0 },
      { x: 33, y: 0 },
      { x: 66, y: 100 },
      { x: 100, y: 100 }
    )
    const curveData = createCurveData(bezier)
    const result = calculatePositionOnCurve(curveData, 0)

    expect(result.position.x).toBeCloseTo(0)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('should calculate position at end of curve', () => {
    const bezier = createBezierCurve(
      { x: 0, y: 0 },
      { x: 33, y: 0 },
      { x: 66, y: 100 },
      { x: 100, y: 100 }
    )
    const curveData = createCurveData(bezier)
    const totalLength = curveData.arcLengthTable[curveData.arcLengthTable.length - 1].distance
    const result = calculatePositionOnCurve(curveData, totalLength)

    expect(result.position.x).toBeCloseTo(100)
    expect(result.position.y).toBeCloseTo(100)
  })
})

describe('updateAxlePosition', () => {
  describe('movement within current segment (line)', () => {
    it('should update position when moving within a line segment', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [{
          type: 'line',
          lineId: 'line1',
          startOffset: 0,
          endOffset: 100,
          length: 100
        }],
        totalDistance: 100
      }

      const axleState = createAxleState('line1', 0, 0, 0)
      const axleExecution = createAxleExecution(0, 0)
      const velocity = 10

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap
      )

      expect(result.completed).toBe(false)
      expect(result.execution.currentSegmentIndex).toBe(0)
      expect(result.execution.segmentDistance).toBe(10)
      expect(result.axleState.position.x).toBeCloseTo(10)
    })

    it('should accumulate distance over multiple updates', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [{
          type: 'line',
          lineId: 'line1',
          startOffset: 0,
          endOffset: 100,
          length: 100
        }],
        totalDistance: 100
      }

      let axleState = createAxleState('line1', 0, 0, 0)
      let axleExecution = createAxleExecution(0, 0)
      const velocity = 10

      let result = updateAxlePosition(axleState, axleExecution, path, velocity, linesMap, curveDataMap)
      axleState = result.axleState
      axleExecution = result.execution

      result = updateAxlePosition(axleState, axleExecution, path, velocity, linesMap, curveDataMap)
      axleState = result.axleState
      axleExecution = result.execution

      result = updateAxlePosition(axleState, axleExecution, path, velocity, linesMap, curveDataMap)

      expect(result.execution.segmentDistance).toBe(30)
      expect(result.axleState.position.x).toBeCloseTo(30)
    })
  })

  describe('segment transitions', () => {
    it('should transition from line to curve segment', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const bezier = createBezierCurve(
        { x: 100, y: 0 },
        { x: 133, y: 0 },
        { x: 166, y: 50 },
        { x: 200, y: 50 }
      )
      const curveData = createCurveData(bezier)
      const curveLength = curveData.arcLengthTable[curveData.arcLengthTable.length - 1].distance

      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map([[0, curveData]])

      const lineSegment: PathSegment = {
        type: 'line',
        lineId: 'line1',
        startOffset: 0,
        endOffset: 100,
        length: 100
      }

      const curveSegment: PathSegment = {
        type: 'curve',
        curveIndex: 0,
        startOffset: 0,
        endOffset: curveLength,
        length: curveLength
      }

      const path: PathResult = {
        segments: [lineSegment, curveSegment],
        totalDistance: 100 + curveLength
      }

      const axleState = createAxleState('line1', 95, 0, 95)
      const axleExecution = createAxleExecution(0, 95)
      const velocity = 10

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap
      )

      expect(result.completed).toBe(false)
      expect(result.execution.currentSegmentIndex).toBe(1)
      expect(result.execution.segmentDistance).toBeCloseTo(5)
      expect(result.axleState.position.x).toBeGreaterThan(100)
    })

    it('should handle exact segment boundary transition', () => {
      const line1 = createLine('line1', 0, 0, 100, 0)
      const line2 = createLine('line2', 100, 0, 200, 0)

      const linesMap = new Map([['line1', line1], ['line2', line2]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [
          { type: 'line', lineId: 'line1', startOffset: 0, endOffset: 100, length: 100 },
          { type: 'line', lineId: 'line2', startOffset: 0, endOffset: 100, length: 100 }
        ],
        totalDistance: 200
      }

      const axleState = createAxleState('line1', 90, 0, 90)
      const axleExecution = createAxleExecution(0, 90)
      const velocity = 10

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap
      )

      expect(result.completed).toBe(false)
      expect(result.execution.currentSegmentIndex).toBe(1)
      expect(result.execution.segmentDistance).toBe(0)
    })
  })

  describe('path completion', () => {
    it('should complete at end of single line segment', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [{
          type: 'line',
          lineId: 'line1',
          startOffset: 0,
          endOffset: 100,
          length: 100
        }],
        totalDistance: 100
      }

      const axleState = createAxleState('line1', 95, 0, 95)
      const axleExecution = createAxleExecution(0, 95)
      const velocity = 10

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap
      )

      expect(result.completed).toBe(true)
      expect(result.execution.segmentDistance).toBe(100)
      expect(result.axleState.position.x).toBeCloseTo(100)
      expect(result.axleState.absoluteOffset).toBe(100)
    })
  })

  describe('front axle extension with maxOffset', () => {
    it('should extend beyond path end when maxOffset allows', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [{
          type: 'line',
          lineId: 'line1',
          startOffset: 0,
          endOffset: 80,
          length: 80
        }],
        totalDistance: 80
      }

      const axleState = createAxleState('line1', 75, 0, 75)
      const axleExecution = createAxleExecution(0, 75)
      const velocity = 10
      const maxOffset = 100

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap,
        maxOffset
      )

      expect(result.completed).toBe(false)
      expect(result.execution.segmentDistance).toBe(85)
      expect(result.axleState.position.x).toBeCloseTo(85)
      expect(result.axleState.absoluteOffset).toBe(85)
    })

    it('should clamp to maxOffset and complete when reached', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [{
          type: 'line',
          lineId: 'line1',
          startOffset: 0,
          endOffset: 80,
          length: 80
        }],
        totalDistance: 80
      }

      const axleState = createAxleState('line1', 95, 0, 95)
      const axleExecution = createAxleExecution(0, 95)
      const velocity = 10
      const maxOffset = 100

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap,
        maxOffset
      )

      expect(result.completed).toBe(true)
      expect(result.axleState.position.x).toBeCloseTo(100)
      expect(result.axleState.absoluteOffset).toBe(100)
    })
  })

  describe('edge cases', () => {
    it('should handle zero velocity', () => {
      const line = createLine('line1', 0, 0, 100, 0)
      const linesMap = new Map([['line1', line]])
      const curveDataMap = new Map<number, CurveData>()

      const path: PathResult = {
        segments: [{
          type: 'line',
          lineId: 'line1',
          startOffset: 0,
          endOffset: 100,
          length: 100
        }],
        totalDistance: 100
      }

      const axleState = createAxleState('line1', 50, 0, 50)
      const axleExecution = createAxleExecution(0, 50)
      const velocity = 0

      const result = updateAxlePosition(
        axleState,
        axleExecution,
        path,
        velocity,
        linesMap,
        curveDataMap
      )

      expect(result.completed).toBe(false)
      expect(result.execution.segmentDistance).toBe(50)
      expect(result.axleState.position.x).toBeCloseTo(50)
    })
  })
})

// =============================================================================
// Path Preparation Tests
// =============================================================================

describe('pathPreparation', () => {
  describe('prepareCommandPath', () => {
    describe('early returns', () => {
      it('should return null when target line not found', () => {
        const lines = [createLine('line1', 0, 0, 100, 0)]
        const ctx = createSceneContext(lines)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 0 } })
        const command = createGotoCommand({ targetLineId: 'nonexistent', targetOffset: 50 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).toBeNull()
      })

      it('should return null when no path found (disconnected lines)', () => {
        const lines = [
          createLine('line1', 0, 0, 100, 0),
          createLine('line2', 200, 0, 300, 0)
        ]
        const ctx = createSceneContext(lines, [])
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 0 } })
        const command = createGotoCommand({ targetLineId: 'line2', targetOffset: 50 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).toBeNull()
      })
    })

    describe('same line movement', () => {
      it('should return path for forward movement on same line', () => {
        const lines = [createLine('line1', 0, 0, 100, 0)]
        const ctx = createSceneContext(lines)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 20 } })
        const command = createGotoCommand({ targetLineId: 'line1', targetOffset: 80 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).not.toBeNull()
        expect(result!.path.segments.length).toBe(1)
        expect(result!.path.segments[0].type).toBe('line')
        expect(result!.path.segments[0].lineId).toBe('line1')
        expect(result!.path.segments[0].startOffset).toBe(20)
        expect(result!.path.segments[0].endOffset).toBe(80)
        expect(result!.path.segments[0].length).toBe(60)
      })

      it('should return null for backward movement on same line (not supported)', () => {
        const lines = [createLine('line1', 0, 0, 100, 0)]
        const ctx = createSceneContext(lines)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 80 } })
        const command = createGotoCommand({ targetLineId: 'line1', targetOffset: 20 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).toBeNull()
      })
    })

    describe('percentage offset handling', () => {
      it('should convert percentage offset to absolute', () => {
        const lines = [createLine('line1', 0, 0, 200, 0)]
        const ctx = createSceneContext(lines)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 0 } })
        const command = createGotoCommand({
          targetLineId: 'line1',
          targetOffset: 0.5, // Internal format is now 0-1
          isPercentage: true
        })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).not.toBeNull()
        expect(result!.path.segments[0].endOffset).toBe(92.5)
      })
    })

    describe('cross-line movement with curves', () => {
      it('should return path with curve segment', () => {
        const lines = [
          createLine('line1', 0, 0, 100, 0),
          createLine('line2', 150, 0, 250, 0)
        ]
        const curves: Curve[] = [
          { fromLineId: 'line1', toLineId: 'line2' }
        ]
        const ctx = createSceneContext(lines, curves)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 50 } })
        const command = createGotoCommand({ targetLineId: 'line2', targetOffset: 50 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).not.toBeNull()
        expect(result!.path.segments.length).toBe(3)
        expect(result!.path.segments[0].type).toBe('line')
        expect(result!.path.segments[1].type).toBe('curve')
        expect(result!.path.segments[2].type).toBe('line')
      })

      it('should build curveDataMap for curve segments', () => {
        const lines = [
          createLine('line1', 0, 0, 100, 0),
          createLine('line2', 150, 0, 250, 0)
        ]
        const curves: Curve[] = [
          { fromLineId: 'line1', toLineId: 'line2' }
        ]
        const ctx = createSceneContext(lines, curves)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 50 } })
        const command = createGotoCommand({ targetLineId: 'line2', targetOffset: 50 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).not.toBeNull()
        expect(result!.curveDataMap.size).toBe(1)
        expect(result!.curveDataMap.has(0)).toBe(true)

        const curveData = result!.curveDataMap.get(0)!
        expect(curveData.bezier).toBeDefined()
        expect(curveData.arcLengthTable).toBeDefined()
        expect(curveData.arcLengthTable.length).toBeGreaterThan(0)
      })
    })

    describe('edge cases', () => {
      it('should handle vehicle already at target position', () => {
        const lines = [createLine('line1', 0, 0, 100, 0)]
        const ctx = createSceneContext(lines)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 50 } })
        const command = createGotoCommand({ targetLineId: 'line1', targetOffset: 50 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).not.toBeNull()
        expect(result!.path.totalDistance).toBe(0)
      })

      it('should return empty curveDataMap for path with no curves', () => {
        const lines = [createLine('line1', 0, 0, 100, 0)]
        const ctx = createSceneContext(lines)
        const vehicle = createMockVehicle({ lineId: 'line1', rear: { absoluteOffset: 0 } })
        const command = createGotoCommand({ targetLineId: 'line1', targetOffset: 50 })

        const result = prepareCommandPath(vehicle, command, ctx)

        expect(result).not.toBeNull()
        expect(result!.curveDataMap.size).toBe(0)
      })
    })
  })
})

// =============================================================================
// Dual Axle Movement Tests
// =============================================================================

describe('dualAxleMovement', () => {
  describe('single line movement to 100%', () => {
    it('should position F at line endpoint when R reaches (length - wheelbase)', () => {
      const line = createMockLine('line001', { x: 97, y: 494 }, { x: 542, y: 115 })
      const wheelbase = 50
      const lineLength = getLineLength(line)

      const rearFinalOffset = lineLength - wheelbase
      const front = calculateInitialFrontPosition('line001', rearFinalOffset, wheelbase, line)

      expect(front.position.x).toBeCloseTo(542, 1)
      expect(front.position.y).toBeCloseTo(115, 1)
      expect(front.absoluteOffset).toBeCloseTo(lineLength, 1)
    })

    it('should maintain wheelbase distance throughout movement', () => {
      const line = createMockLine('line001', { x: 97, y: 494 }, { x: 542, y: 115 })
      const wheelbase = 50
      const lineLength = getLineLength(line)

      const testPoints = [0, 50, 100, 150, 200, 250, 300]

      for (const rearOffset of testPoints) {
        if (rearOffset > lineLength - wheelbase) continue

        const rearPos = getPositionOnLine(line, rearOffset)
        const frontOffset = Math.min(rearOffset + wheelbase, lineLength)
        const frontPos = getPositionOnLine(line, frontOffset)

        const actualDistance = Math.sqrt(
          Math.pow(frontPos.x - rearPos.x, 2) +
          Math.pow(frontPos.y - rearPos.y, 2)
        )

        if (frontOffset < lineLength) {
          expect(actualDistance).toBeCloseTo(wheelbase, 1)
        }
      }
    })
  })

  describe('boundary conditions', () => {
    it('start at 0%: R at (0), F at (wheelbase)', () => {
      const line = createMockLine('line1', { x: 0, y: 0 }, { x: 100, y: 0 })
      const wheelbase = 20

      const front = calculateInitialFrontPosition('line1', 0, wheelbase, line)

      expect(front.absoluteOffset).toBe(wheelbase)
      expect(front.position.x).toBeCloseTo(20, 1)
      expect(front.position.y).toBeCloseTo(0, 1)
    })

    it('start at 100%: R at (length - wheelbase), F at (length)', () => {
      const line = createMockLine('line1', { x: 0, y: 0 }, { x: 100, y: 0 })
      const wheelbase = 20
      const lineLength = 100
      const effectiveLength = lineLength - wheelbase

      const front = calculateInitialFrontPosition('line1', effectiveLength, wheelbase, line)

      expect(front.absoluteOffset).toBe(100)
      expect(front.position.x).toBeCloseTo(100, 1)
      expect(front.position.y).toBeCloseTo(0, 1)
    })
  })
})

// =============================================================================
// User Scenario Tests
// =============================================================================

describe('User Scenario: line001 with goto 100%', () => {
  const line: Line = {
    id: 'line001',
    start: { x: 97, y: 494 },
    end: { x: 542, y: 115 }
  }
  const wheelbase = 30
  const lineLength = getLineLength(line)
  const effectiveLength = lineLength - wheelbase

  it('should calculate correct line length', () => {
    const dx = 542 - 97
    const dy = 115 - 494
    const expectedLength = Math.sqrt(dx * dx + dy * dy)

    expect(lineLength).toBeCloseTo(expectedLength, 2)
  })

  describe('Final position (v1 goto line001 100%)', () => {
    it('R should stop at (effectiveLength) NOT at endpoint', () => {
      const rearFinalOffset = effectiveLength
      const rearFinalPos = getPositionOnLine(line, rearFinalOffset)

      expect(rearFinalPos.x).not.toBeCloseTo(542, 0)
      expect(rearFinalPos.y).not.toBeCloseTo(115, 0)

      const distanceToEnd = Math.sqrt(
        Math.pow(line.end.x - rearFinalPos.x, 2) +
        Math.pow(line.end.y - rearFinalPos.y, 2)
      )
      expect(distanceToEnd).toBeCloseTo(wheelbase, 1)
    })

    it('F should stop EXACTLY at endpoint (542, 115)', () => {
      const rearFinalOffset = effectiveLength
      const front = calculateInitialFrontPosition('line001', rearFinalOffset, wheelbase, line)

      expect(front.position.x).toBeCloseTo(542, 1)
      expect(front.position.y).toBeCloseTo(115, 1)
      expect(front.absoluteOffset).toBeCloseTo(lineLength, 1)
    })

    it('should maintain wheelbase distance between R and F at final position', () => {
      const rearFinalOffset = effectiveLength
      const rearFinalPos = getPositionOnLine(line, rearFinalOffset)

      const front = calculateInitialFrontPosition('line001', rearFinalOffset, wheelbase, line)

      const distance = Math.sqrt(
        Math.pow(front.position.x - rearFinalPos.x, 2) +
        Math.pow(front.position.y - rearFinalPos.y, 2)
      )

      expect(distance).toBeCloseTo(wheelbase, 1)
    })
  })
})

// =============================================================================
// Partial Target Scenario Tests
// =============================================================================

describe('Partial Target Scenario: goto 50%', () => {
  const line002: Line = {
    id: 'line002',
    start: { x: 561, y: 226 },
    end: { x: 249, y: 571 }
  }
  const wheelbase = 60
  const lineLength = getLineLength(line002)
  const effectiveLength = lineLength - wheelbase

  describe('Universal Rule: F = R + wheelbase', () => {
    it('should work for 0% target', () => {
      const rearOffset = 0
      const front = calculateInitialFrontPosition('line002', rearOffset, wheelbase, line002)

      expect(front.absoluteOffset).toBeCloseTo(wheelbase, 1)
    })

    it('should work for 50% target', () => {
      const rearOffset = effectiveLength * 0.5
      const front = calculateInitialFrontPosition('line002', rearOffset, wheelbase, line002)

      expect(front.absoluteOffset).toBeCloseTo(rearOffset + wheelbase, 1)
    })

    it('should work for 100% target (F at endpoint)', () => {
      const rearOffset = effectiveLength
      const front = calculateInitialFrontPosition('line002', rearOffset, wheelbase, line002)

      expect(front.absoluteOffset).toBeCloseTo(lineLength, 1)
      expect(front.position.x).toBeCloseTo(line002.end.x, 1)
      expect(front.position.y).toBeCloseTo(line002.end.y, 1)
    })
  })
})
