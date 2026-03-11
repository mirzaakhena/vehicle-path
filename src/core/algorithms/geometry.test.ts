import { describe, it, expect } from 'vitest'
import { projectPointOnLine, getValidRearOffsetRange, computeMinLineLength } from './geometry'
import type { Line, Curve } from '../types/geometry'

// Helper: buat line horizontal sederhana
const hLine = (id: string, x1: number, x2: number, y = 0): Line => ({
  id,
  start: { x: x1, y },
  end: { x: x2, y }
})

// ─────────────────────────────────────────────
// projectPointOnLine
// ─────────────────────────────────────────────
describe('projectPointOnLine', () => {
  const line = hLine('L1', 0, 100) // horizontal line dari (0,0) ke (100,0)

  it('point tepat di atas tengah garis', () => {
    const result = projectPointOnLine({ x: 50, y: 0 }, line)
    expect(result.offset).toBeCloseTo(50)
    expect(result.distance).toBeCloseTo(0)
  })

  it('point di atas garis dengan jarak tegak lurus', () => {
    const result = projectPointOnLine({ x: 50, y: 30 }, line)
    expect(result.offset).toBeCloseTo(50)
    expect(result.distance).toBeCloseTo(30)
  })

  it('point di bawah garis (jarak selalu positif)', () => {
    const result = projectPointOnLine({ x: 50, y: -20 }, line)
    expect(result.offset).toBeCloseTo(50)
    expect(result.distance).toBeCloseTo(20)
  })

  it('point di luar ujung kiri — clamp ke offset 0', () => {
    const result = projectPointOnLine({ x: -10, y: 0 }, line)
    expect(result.offset).toBeCloseTo(0)
    expect(result.distance).toBeCloseTo(10)
  })

  it('point di luar ujung kanan — clamp ke lineLength', () => {
    const result = projectPointOnLine({ x: 120, y: 0 }, line)
    expect(result.offset).toBeCloseTo(100)
    expect(result.distance).toBeCloseTo(20)
  })

  it('line dengan panjang nol — offset 0, distance ke titik start', () => {
    const zeroLine: Line = { id: 'Z', start: { x: 50, y: 50 }, end: { x: 50, y: 50 } }
    const result = projectPointOnLine({ x: 53, y: 54 }, zeroLine)
    expect(result.offset).toBe(0)
    expect(result.distance).toBeCloseTo(5)
  })

  it('line diagonal — proyeksi tepat di tengah', () => {
    const diagLine: Line = { id: 'D', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } }
    const result = projectPointOnLine({ x: 50, y: 50 }, diagLine)
    expect(result.offset).toBeCloseTo(Math.sqrt(50 * 50 + 50 * 50))
    expect(result.distance).toBeCloseTo(0)
  })
})

// ─────────────────────────────────────────────
// getValidRearOffsetRange
// ─────────────────────────────────────────────
describe('getValidRearOffsetRange', () => {
  const line = hLine('L1', 0, 100) // panjang 100

  it('vehicle 2-axle normal — [0, lineLength - spacing]', () => {
    const [min, max] = getValidRearOffsetRange(line, [40])
    expect(min).toBe(0)
    expect(max).toBeCloseTo(60)
  })

  it('vehicle 3-axle normal', () => {
    const [min, max] = getValidRearOffsetRange(line, [30, 30])
    expect(min).toBe(0)
    expect(max).toBeCloseTo(40)
  })

  it('spacing tepat sama dengan panjang line — max = 0', () => {
    const [min, max] = getValidRearOffsetRange(line, [100])
    expect(min).toBe(0)
    expect(max).toBe(0)
  })

  it('spacing lebih besar dari panjang line — max tetap 0, bukan negatif', () => {
    const [min, max] = getValidRearOffsetRange(line, [150])
    expect(min).toBe(0)
    expect(max).toBe(0)
  })

  it('axleSpacings kosong (single axle) — [0, lineLength]', () => {
    const [min, max] = getValidRearOffsetRange(line, [])
    expect(min).toBe(0)
    expect(max).toBeCloseTo(100)
  })
})

// ─────────────────────────────────────────────
// computeMinLineLength
// ─────────────────────────────────────────────
describe('computeMinLineLength', () => {
  it('tidak ada curves — return 0', () => {
    expect(computeMinLineLength('L1', [])).toBe(0)
  })

  it('curve tidak melibatkan lineId ini — return 0', () => {
    const curves: Curve[] = [
      { fromLineId: 'L2', toLineId: 'L3', fromOffset: 50 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(0)
  })

  it('satu curve sebagai fromLine dengan absolute offset', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 80 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(80)
  })

  it('satu curve sebagai toLine dengan absolute offset', () => {
    const curves: Curve[] = [
      { fromLineId: 'L2', toLineId: 'L1', toOffset: 60 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(60)
  })

  it('multiple curves — return maximum dari semua offset', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 80 },
      { fromLineId: 'L3', toLineId: 'L1', toOffset: 90 },
      { fromLineId: 'L1', toLineId: 'L4', fromOffset: 50 },
    ]
    expect(computeMinLineLength('L1', curves)).toBe(90)
  })

  it('percentage offset diabaikan — tidak berkontribusi ke minimum', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 0.8, fromIsPercentage: true }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(0)
  })

  it('mix absolute dan percentage — hanya absolute yang dihitung', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2', fromOffset: 0.9, fromIsPercentage: true },
      { fromLineId: 'L3', toLineId: 'L1', toOffset: 70 }
    ]
    expect(computeMinLineLength('L1', curves)).toBe(70)
  })

  it('fromOffset undefined — diabaikan', () => {
    const curves: Curve[] = [
      { fromLineId: 'L1', toLineId: 'L2' } // tanpa offset
    ]
    expect(computeMinLineLength('L1', curves)).toBe(0)
  })
})
