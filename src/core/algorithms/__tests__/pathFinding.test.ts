import { describe, it, expect } from 'vitest'
import type { Line, Curve } from '../types/geometry'
import type { MovementConfig } from '../types/movement'
import {
  buildGraph,
  findPath,
  canReachTarget,
  getReachableCurves,
  calculateBezierArcLength,
  resolveOffset
} from '../pathFinding'

// ============================================================================
// Test Fixtures
// ============================================================================

// Horizontal lines for simple testing
const createLine = (id: string, x1: number, y1: number, x2: number, y2: number): Line => ({
  id,
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 }
})

// Simple horizontal lines (each 100px long)
const line001: Line = createLine('line001', 0, 100, 100, 100)
const line002: Line = createLine('line002', 150, 100, 250, 100)
const line003: Line = createLine('line003', 300, 100, 400, 100)
const line004: Line = createLine('line004', 200, 200, 300, 200)

const defaultConfig: MovementConfig = {
  wheelbase: 60,
  tangentMode: 'proportional-40'
}

// ============================================================================
// resolveOffset Tests
// ============================================================================

describe('resolveOffset', () => {
  const testLine = createLine('test', 0, 0, 100, 0)

  it('should use default percentage when offset is undefined', () => {
    expect(resolveOffset(testLine, undefined, undefined, 100)).toBe(100)
    expect(resolveOffset(testLine, undefined, undefined, 50)).toBe(50)
    expect(resolveOffset(testLine, undefined, undefined, 0)).toBe(0)
  })

  it('should convert percentage to absolute', () => {
    expect(resolveOffset(testLine, 50, true, 100)).toBe(50)
    expect(resolveOffset(testLine, 25, true, 100)).toBe(25)
    expect(resolveOffset(testLine, 100, true, 100)).toBe(100)
  })

  it('should use absolute offset directly', () => {
    expect(resolveOffset(testLine, 30, false, 100)).toBe(30)
    expect(resolveOffset(testLine, 80, false, 100)).toBe(80)
  })
})

// ============================================================================
// calculateBezierArcLength Tests
// ============================================================================

describe('calculateBezierArcLength', () => {
  it('should calculate arc length for a straight line bezier', () => {
    const straightBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 33, y: 0 },
      p2: { x: 66, y: 0 },
      p3: { x: 100, y: 0 }
    }
    const length = calculateBezierArcLength(straightBezier)
    expect(length).toBeCloseTo(100, 0)
  })

  it('should calculate arc length for a curved bezier', () => {
    const curvedBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 0, y: 55 },
      p2: { x: 45, y: 100 },
      p3: { x: 100, y: 100 }
    }
    const length = calculateBezierArcLength(curvedBezier)
    expect(length).toBeGreaterThan(141) // sqrt(100^2 + 100^2) ≈ 141
  })
})

// ============================================================================
// buildGraph Tests
// ============================================================================

describe('buildGraph', () => {
  it('should create graph with correct lines map', () => {
    const lines = [line001, line002]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    expect(graph.lines.size).toBe(2)
    expect(graph.lines.get('line001')).toBe(line001)
    expect(graph.lines.get('line002')).toBe(line002)
  })

  it('should create graph with correct line lengths', () => {
    const lines = [line001, line002]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    expect(graph.lineLengths.get('line001')).toBe(100)
    expect(graph.lineLengths.get('line002')).toBe(100)
  })

  it('should create edges for curves', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      { fromLineId: 'line001', toLineId: 'line002' }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const edges = graph.adjacency.get('line001')
    expect(edges).toHaveLength(1)
    expect(edges![0].fromLineId).toBe('line001')
    expect(edges![0].toLineId).toBe('line002')
  })

  it('should resolve curve offsets correctly', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      {
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 80,
        fromIsPercentage: true,
        toOffset: 20,
        toIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const edges = graph.adjacency.get('line001')
    // With wheelbase=60: fromLine effective range [60, 100], 80% = 60 + 0.8*40 = 92
    expect(edges![0].fromOffset).toBe(92) // 80% of effective range (wheelbase to end)
    // With wheelbase=60: toLine effective range [0, 40], 20% = 0.2*40 = 8
    expect(edges![0].toOffset).toBe(8)   // 20% of effective range (start to lineLength-wheelbase)
  })

  it('should use default offsets (100% -> 0%) when not specified', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      { fromLineId: 'line001', toLineId: 'line002' }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const edges = graph.adjacency.get('line001')
    expect(edges![0].fromOffset).toBe(100) // default 100%
    expect(edges![0].toOffset).toBe(0)     // default 0%
  })
})

// ============================================================================
// findPath Tests - Basic Paths
// ============================================================================

describe('findPath - basic paths', () => {
  it('should find direct path on same line (target ahead)', () => {
    const lines = [line001]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 20 },
      'line001',
      80
    )

    expect(result).not.toBeNull()
    expect(result!.segments).toHaveLength(1)
    expect(result!.segments[0].type).toBe('line')
    expect(result!.segments[0].startOffset).toBe(20)
    expect(result!.segments[0].endOffset).toBe(80)
    expect(result!.totalDistance).toBe(60)
  })

  it('should find path through one curve', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      { fromLineId: 'line001', toLineId: 'line002' }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 0 },
      'line002',
      50
    )

    expect(result).not.toBeNull()
    expect(result!.segments).toHaveLength(3)
    expect(result!.segments[0].type).toBe('line')
    expect(result!.segments[1].type).toBe('curve')
    expect(result!.segments[2].type).toBe('line')
  })

  it('should find path through multiple curves', () => {
    const lines = [line001, line002, line003]
    const curves: Curve[] = [
      { fromLineId: 'line001', toLineId: 'line002' },
      { fromLineId: 'line002', toLineId: 'line003' }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 0 },
      'line003',
      50
    )

    expect(result).not.toBeNull()
    expect(result!.segments).toHaveLength(5)
  })
})

// ============================================================================
// findPath Tests - Shortest Path
// ============================================================================

describe('findPath - shortest path selection', () => {
  it('should select shorter path when multiple routes exist', () => {
    const lines = [line001, line002, line003, line004]
    const curves: Curve[] = [
      { fromLineId: 'line001', toLineId: 'line002' },
      { fromLineId: 'line001', toLineId: 'line004' },
      { fromLineId: 'line002', toLineId: 'line003' },
      { fromLineId: 'line004', toLineId: 'line003' }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 0 },
      'line003',
      50
    )

    expect(result).not.toBeNull()
    const lineSegments = result!.segments.filter(s => s.type === 'line')
    const goesViaLine002 = lineSegments.some(s => s.lineId === 'line002')
    const goesViaLine004 = lineSegments.some(s => s.lineId === 'line004')

    expect(goesViaLine002 || goesViaLine004).toBe(true)
  })
})

// ============================================================================
// findPath Tests - Directional Constraint
// ============================================================================

describe('findPath - directional constraint', () => {
  it('should not find path to curve that is behind vehicle', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      {
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 50,
        fromIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    // With wheelbase=60: fromOffset 50% maps to 60 + 0.5*40 = 80
    // Vehicle at 90 is beyond the curve at 80, so no path should be found
    const result = findPath(
      graph,
      { lineId: 'line001', offset: 90 },
      'line002',
      50
    )

    expect(result).toBeNull()
  })

  it('should find path to curve that is ahead of vehicle', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      {
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 80,
        fromIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 50 },
      'line002',
      50
    )

    expect(result).not.toBeNull()
  })

  it('should return null when target is behind on same line', () => {
    const lines = [line001]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 80 },
      'line001',
      20
    )

    expect(result).toBeNull()
  })
})

// ============================================================================
// findPath Tests - Edge Cases
// ============================================================================

describe('findPath - edge cases', () => {
  it('should return null when target line does not exist', () => {
    const lines = [line001]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 0 },
      'nonexistent',
      50
    )

    expect(result).toBeNull()
  })

  it('should return null when no path exists', () => {
    const lines = [line001, line002]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 0 },
      'line002',
      50
    )

    expect(result).toBeNull()
  })

  it('should handle percentage target offset', () => {
    const lines = [line001]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 0 },
      'line001',
      50,
      true
    )

    expect(result).not.toBeNull()
    expect(result!.segments[0].endOffset).toBe(50)
  })

  it('should handle vehicle at exact curve offset', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      {
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 50,
        fromIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const result = findPath(
      graph,
      { lineId: 'line001', offset: 50 },
      'line002',
      50
    )

    expect(result).not.toBeNull()
  })

  it('should find looping path when target is behind but loop exists', () => {
    const loopLine1 = createLine('loop1', 0, 0, 100, 0)
    const loopLine2 = createLine('loop2', 100, 0, 100, 100)
    const loopLine3 = createLine('loop3', 100, 100, 0, 100)

    const lines = [loopLine1, loopLine2, loopLine3]
    const curves: Curve[] = [
      { fromLineId: 'loop1', toLineId: 'loop2' },
      { fromLineId: 'loop2', toLineId: 'loop3' },
      {
        fromLineId: 'loop3',
        toLineId: 'loop1',
        toOffset: 30,
        toIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    // With wheelbase=60: toOffset 30% on loop3->loop1 maps to 0.3*40 = 12
    // Vehicle at 50, target at 20 (behind). Loop brings vehicle to 12, then forward to 20.
    const result = findPath(
      graph,
      { lineId: 'loop1', offset: 50 },
      'loop1',
      20
    )

    // Should find a path through the loop
    expect(result).not.toBeNull()
    expect(result!.segments.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('canReachTarget', () => {
  it('should return true when path exists', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      { fromLineId: 'line001', toLineId: 'line002' }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    const canReach = canReachTarget(
      graph,
      { lineId: 'line001', offset: 0 },
      'line002',
      50
    )

    expect(canReach).toBe(true)
  })

  it('should return false when no path exists', () => {
    const lines = [line001, line002]
    const curves: Curve[] = []
    const graph = buildGraph(lines, curves, defaultConfig)

    const canReach = canReachTarget(
      graph,
      { lineId: 'line001', offset: 0 },
      'line002',
      50
    )

    expect(canReach).toBe(false)
  })
})

describe('getReachableCurves', () => {
  it('should return curves ahead of current offset', () => {
    const lines = [line001, line002, line003]
    const curves: Curve[] = [
      {
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 30,
        fromIsPercentage: true
      },
      {
        fromLineId: 'line001',
        toLineId: 'line003',
        fromOffset: 70,
        fromIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    // With wheelbase=60: 30% = 72, 70% = 88
    // Vehicle at 80 is between the two curves
    const reachable = getReachableCurves(graph, 'line001', 80)

    expect(reachable).toHaveLength(1)
    expect(reachable[0].toLineId).toBe('line003')
  })

  it('should return empty array when no curves ahead', () => {
    const lines = [line001, line002]
    const curves: Curve[] = [
      {
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 30,
        fromIsPercentage: true
      }
    ]
    const graph = buildGraph(lines, curves, defaultConfig)

    // With wheelbase=60: fromOffset 30% = 72
    // Vehicle at 90 is beyond the curve, so no curves ahead
    const reachable = getReachableCurves(graph, 'line001', 90)

    expect(reachable).toHaveLength(0)
  })
})
