import type { Line, Curve, BezierCurve } from '../types/core'
import type { MovementConfig } from '../types/movement'
import { distance, createBezierCurve, getPointOnBezier } from './math'

// ============================================================================
// Types
// ============================================================================

export interface GraphEdge {
  curveIndex: number          // Index dalam array curves
  fromLineId: string
  toLineId: string
  fromOffset: number          // Absolute offset (dalam pixels)
  toOffset: number            // Absolute offset (dalam pixels)
  curveLength: number         // Arc length dari bezier curve
}

export interface Graph {
  // adjacency list: lineId -> array of edges yang keluar dari line tersebut
  adjacency: Map<string, GraphEdge[]>
  // Map untuk quick lookup line by id
  lines: Map<string, Line>
  // Map untuk quick lookup line length
  lineLengths: Map<string, number>
}

export interface PathSegment {
  type: 'line' | 'curve'
  lineId?: string             // Untuk type 'line'
  curveIndex?: number         // Untuk type 'curve'
  startOffset: number         // Absolute offset start
  endOffset: number           // Absolute offset end
  length: number              // Total length segment ini
}

export interface PathResult {
  segments: PathSegment[]
  totalDistance: number
}

export interface VehiclePosition {
  lineId: string
  offset: number              // Absolute offset (dalam pixels)
}

// ============================================================================
// Arc Length Calculation
// ============================================================================

/**
 * Menghitung arc length dari bezier curve menggunakan numerical integration
 */
export function calculateBezierArcLength(bezier: BezierCurve, segments: number = 100): number {
  let length = 0
  let prevPoint = bezier.p0

  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const point = getPointOnBezier(bezier, t)
    length += distance(prevPoint, point)
    prevPoint = point
  }

  return length
}

// ============================================================================
// Graph Building
// ============================================================================

/**
 * Menghitung absolute offset dari offset yang mungkin percentage
 * (Legacy function - use resolveFromLineOffset/resolveToLineOffset for curve offsets)
 */
export function resolveOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number
): number {
  const lineLength = distance(line.start, line.end)

  if (offset === undefined) {
    // Use default percentage
    return (defaultPercentage / 100) * lineLength
  }

  if (isPercentage) {
    return (offset / 100) * lineLength
  }

  return offset
}

/**
 * Resolve offset untuk FROM line (garis asal kurva)
 * - 0% → wheelbase (bukan 0, untuk memberi ruang vehicle)
 * - 100% → lineLength (ujung garis)
 *
 * Effective range: [wheelbase, lineLength]
 */
export function resolveFromLineOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number,
  wheelbase: number
): number {
  const lineLength = distance(line.start, line.end)
  const effectiveLength = lineLength - wheelbase

  // Handle edge case: line too short
  if (effectiveLength <= 0) {
    return lineLength // Fallback to end of line
  }

  let percentage: number
  if (offset === undefined) {
    percentage = defaultPercentage
  } else if (isPercentage) {
    percentage = offset
  } else {
    // Absolute offset - clamp to valid range
    return Math.max(wheelbase, Math.min(offset, lineLength))
  }

  // Map percentage to effective range [wheelbase, lineLength]
  // 0% → wheelbase, 100% → lineLength
  return wheelbase + (percentage / 100) * effectiveLength
}

/**
 * Resolve offset untuk TO line (garis tujuan kurva)
 * - 0% → 0 (awal garis)
 * - 100% → lineLength - wheelbase (untuk memberi ruang vehicle)
 *
 * Effective range: [0, lineLength - wheelbase]
 */
export function resolveToLineOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number,
  wheelbase: number
): number {
  const lineLength = distance(line.start, line.end)
  const effectiveLength = lineLength - wheelbase

  // Handle edge case: line too short
  if (effectiveLength <= 0) {
    return 0 // Fallback to start of line
  }

  let percentage: number
  if (offset === undefined) {
    percentage = defaultPercentage
  } else if (isPercentage) {
    percentage = offset
  } else {
    // Absolute offset - clamp to valid range
    return Math.max(0, Math.min(offset, effectiveLength))
  }

  // Map percentage to effective range [0, lineLength - wheelbase]
  // 0% → 0, 100% → lineLength - wheelbase
  return (percentage / 100) * effectiveLength
}

/**
 * Membangun graph dari lines dan curves
 */
export function buildGraph(
  lines: Line[],
  curves: Curve[],
  config: MovementConfig
): Graph {
  const adjacency = new Map<string, GraphEdge[]>()
  const linesMap = new Map<string, Line>()
  const lineLengths = new Map<string, number>()

  // Populate lines map dan lengths
  for (const line of lines) {
    linesMap.set(line.id, line)
    lineLengths.set(line.id, distance(line.start, line.end))
    adjacency.set(line.id, [])
  }

  // Build edges from curves
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i]
    const fromLine = linesMap.get(curve.fromLineId)
    const toLine = linesMap.get(curve.toLineId)

    if (!fromLine || !toLine) continue

    // Resolve offsets with wheelbase adjustment (default: from 100% to 0%)
    // fromLine: 0% → wheelbase, 100% → lineLength
    // toLine: 0% → 0, 100% → lineLength - wheelbase
    const fromOffset = resolveFromLineOffset(fromLine, curve.fromOffset, curve.fromIsPercentage, 100, config.wheelbase)
    const toOffset = resolveToLineOffset(toLine, curve.toOffset, curve.toIsPercentage, 0, config.wheelbase)

    // Create bezier curve untuk menghitung arc length
    // Pass resolved absolute offsets (not raw percentages)
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

    const curveLength = calculateBezierArcLength(bezier)

    const edge: GraphEdge = {
      curveIndex: i,
      fromLineId: curve.fromLineId,
      toLineId: curve.toLineId,
      fromOffset,
      toOffset,
      curveLength
    }

    adjacency.get(curve.fromLineId)!.push(edge)
  }

  return { adjacency, lines: linesMap, lineLengths }
}

// ============================================================================
// Dijkstra's Algorithm
// ============================================================================

interface DijkstraNode {
  lineId: string
  entryOffset: number         // Posisi masuk ke line ini
  totalDistance: number
  path: PathSegment[]
}

/**
 * Mencari path terpendek dari posisi vehicle ke target
 *
 * @returns PathResult jika path ditemukan, null jika tidak ada path valid
 */
export function findPath(
  graph: Graph,
  vehiclePos: VehiclePosition,
  targetLineId: string,
  targetOffset: number,       // Absolute offset
  targetIsPercentage: boolean = false
): PathResult | null {
  const { adjacency, lines, lineLengths } = graph

  // Resolve target offset jika percentage
  const targetLine = lines.get(targetLineId)
  if (!targetLine) return null

  const targetLineLength = lineLengths.get(targetLineId)!
  const resolvedTargetOffset = targetIsPercentage
    ? (targetOffset / 100) * targetLineLength
    : targetOffset

  // Priority queue (simple array, sorted by totalDistance)
  // Dalam production, gunakan proper min-heap untuk performa lebih baik
  const queue: DijkstraNode[] = []

  // Track visited: "lineId:entryOffset" -> minimum distance yang sudah dicapai
  // We need to track entry offset because entering the same line at different offsets
  // results in different reachability (can only move forward on a line)
  const visited = new Map<string, number>()

  // Helper to create visited key
  const makeVisitedKey = (lineId: string, entryOffset: number) => `${lineId}:${Math.round(entryOffset)}`

  // Kasus khusus: target di line yang sama dan di depan vehicle
  if (vehiclePos.lineId === targetLineId && resolvedTargetOffset >= vehiclePos.offset) {
    const distanceToTarget = resolvedTargetOffset - vehiclePos.offset
    return {
      segments: [{
        type: 'line',
        lineId: vehiclePos.lineId,
        startOffset: vehiclePos.offset,
        endOffset: resolvedTargetOffset,
        length: distanceToTarget
      }],
      totalDistance: distanceToTarget
    }
  }

  // Inisialisasi: cari semua kurva yang bisa diambil dari posisi vehicle
  const startEdges = adjacency.get(vehiclePos.lineId) || []

  for (const edge of startEdges) {
    // Kurva harus di depan posisi vehicle (directional constraint)
    if (edge.fromOffset < vehiclePos.offset) continue

    const distToEdge = edge.fromOffset - vehiclePos.offset
    const distThroughCurve = distToEdge + edge.curveLength

    // Segment pertama: dari vehicle ke titik kurva
    const lineSegment: PathSegment = {
      type: 'line',
      lineId: vehiclePos.lineId,
      startOffset: vehiclePos.offset,
      endOffset: edge.fromOffset,
      length: distToEdge
    }

    // Segment kedua: kurva
    const curveSegment: PathSegment = {
      type: 'curve',
      curveIndex: edge.curveIndex,
      startOffset: 0,
      endOffset: edge.curveLength,
      length: edge.curveLength
    }

    queue.push({
      lineId: edge.toLineId,
      entryOffset: edge.toOffset,
      totalDistance: distThroughCurve,
      path: [lineSegment, curveSegment]
    })
  }

  // Sort queue by totalDistance (ascending)
  queue.sort((a, b) => a.totalDistance - b.totalDistance)

  while (queue.length > 0) {
    const current = queue.shift()!

    // Skip jika sudah ada path lebih pendek ke line ini dengan entry offset yang sama
    const visitedKey = makeVisitedKey(current.lineId, current.entryOffset)
    const prevDist = visited.get(visitedKey)
    if (prevDist !== undefined && prevDist <= current.totalDistance) {
      continue
    }
    visited.set(visitedKey, current.totalDistance)

    // Cek apakah sudah sampai target line
    if (current.lineId === targetLineId) {
      // Tambahkan segment terakhir: dari entry point ke target
      const distToTarget = Math.abs(resolvedTargetOffset - current.entryOffset)

      // Validasi: target harus di depan entry point (atau sama)
      if (resolvedTargetOffset >= current.entryOffset) {
        const finalSegment: PathSegment = {
          type: 'line',
          lineId: targetLineId,
          startOffset: current.entryOffset,
          endOffset: resolvedTargetOffset,
          length: distToTarget
        }

        return {
          segments: [...current.path, finalSegment],
          totalDistance: current.totalDistance + distToTarget
        }
      }
      // Jika target di belakang entry point, kita perlu mencari jalan memutar
      // Lanjutkan pencarian...
    }

    // Explore semua kurva dari line ini
    const edges = adjacency.get(current.lineId) || []

    for (const edge of edges) {
      // Kurva harus di depan entry point (directional constraint)
      if (edge.fromOffset < current.entryOffset) continue

      const distInLine = edge.fromOffset - current.entryOffset
      const newTotalDist = current.totalDistance + distInLine + edge.curveLength

      // Skip jika sudah ada path lebih pendek ke target line dengan entry offset yang sama
      const targetVisitedKey = makeVisitedKey(edge.toLineId, edge.toOffset)
      const prevTargetDist = visited.get(targetVisitedKey)
      if (prevTargetDist !== undefined && prevTargetDist <= newTotalDist) {
        continue
      }

      // Segment: dari entry ke kurva
      const lineSegment: PathSegment = {
        type: 'line',
        lineId: current.lineId,
        startOffset: current.entryOffset,
        endOffset: edge.fromOffset,
        length: distInLine
      }

      // Segment: kurva
      const curveSegment: PathSegment = {
        type: 'curve',
        curveIndex: edge.curveIndex,
        startOffset: 0,
        endOffset: edge.curveLength,
        length: edge.curveLength
      }

      queue.push({
        lineId: edge.toLineId,
        entryOffset: edge.toOffset,
        totalDistance: newTotalDist,
        path: [...current.path, lineSegment, curveSegment]
      })
    }

    // Re-sort queue
    queue.sort((a, b) => a.totalDistance - b.totalDistance)
  }

  // Tidak ada path yang ditemukan
  return null
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Mengecek apakah path valid dari posisi vehicle ke target
 */
export function canReachTarget(
  graph: Graph,
  vehiclePos: VehiclePosition,
  targetLineId: string,
  targetOffset: number,
  targetIsPercentage: boolean = false
): boolean {
  return findPath(graph, vehiclePos, targetLineId, targetOffset, targetIsPercentage) !== null
}

/**
 * Mendapatkan semua kurva yang bisa diambil dari posisi tertentu pada line
 */
export function getReachableCurves(
  graph: Graph,
  lineId: string,
  currentOffset: number
): GraphEdge[] {
  const edges = graph.adjacency.get(lineId) || []
  return edges.filter(edge => edge.fromOffset >= currentOffset)
}
