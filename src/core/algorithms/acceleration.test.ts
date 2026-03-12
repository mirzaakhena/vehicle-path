import { describe, it, expect } from 'vitest'
import type { PathResult } from './pathFinding'
import type { PathExecution } from '../engine'
import {
  computeRemainingToArrival,
  computeDistToNextCurve,
  computeTargetSpeed,
  approachSpeed
} from './acceleration'

// ─── Mock helpers ─────────────────────────────────────────────────────────

function makePath(segments: Array<{ type: 'line' | 'curve'; length: number }>): PathResult {
  let total = 0
  const segs = segments.map((s, i) => {
    const seg = {
      type: s.type,
      lineId: s.type === 'line' ? `L${i}` : undefined,
      curveIndex: s.type === 'curve' ? i : undefined,
      startOffset: 0,
      endOffset: s.length,
      length: s.length,
    }
    total += s.length
    return seg
  })
  return { segments: segs, totalDistance: total, curveCount: segs.filter(s => s.type === 'curve').length }
}

function makeExecution(path: PathResult, segIdx: number, segDist: number): PathExecution {
  return {
    path,
    curveDataMap: new Map(),
    axleExecutions: [{ segmentIndex: segIdx, segmentDistance: segDist }],
    targetLineId: 'L_target',
    targetOffset: 0,
  }
}

// ─── computeRemainingToArrival ─────────────────────────────────────────────

describe('computeRemainingToArrival', () => {
  const path = makePath([{ type: 'line', length: 100 }, { type: 'line', length: 100 }]) // total 200

  it('returns totalDistance when rear axle belum bergerak (segIdx=0, dist=0)', () => {
    const exec = makeExecution(path, 0, 0)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(200)
  })

  it('returns 0 ketika rear axle sudah di ujung path', () => {
    const exec = makeExecution(path, 1, 100)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(0)
  })

  it('returns sisa jarak ketika rear axle di tengah', () => {
    const exec = makeExecution(path, 0, 50)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(150)
  })

  it('returns sisa jarak ketika rear axle di segment kedua', () => {
    const exec = makeExecution(path, 1, 30)
    expect(computeRemainingToArrival(exec)).toBeCloseTo(70)
  })
})

// ─── computeDistToNextCurve ────────────────────────────────────────────────

describe('computeDistToNextCurve', () => {
  it('returns null jika tidak ada curve dalam path', () => {
    const path = makePath([{ type: 'line', length: 100 }, { type: 'line', length: 100 }])
    const exec = makeExecution(path, 0, 0)
    expect(computeDistToNextCurve(exec)).toBeNull()
  })

  it('returns 0 jika rear axle sedang berada di dalam curve', () => {
    const path = makePath([
      { type: 'line', length: 100 },
      { type: 'curve', length: 50 },
      { type: 'line', length: 100 },
    ])
    const exec = makeExecution(path, 1, 10)
    expect(computeDistToNextCurve(exec)).toBe(0)
  })

  it('returns jarak dari posisi saat ini ke awal curve berikutnya', () => {
    const path = makePath([
      { type: 'line', length: 100 },
      { type: 'curve', length: 50 },
      { type: 'line', length: 100 },
    ])
    const exec = makeExecution(path, 0, 60)
    expect(computeDistToNextCurve(exec)).toBeCloseTo(40)
  })

  it('returns 0 jika rear axle tepat di awal curve', () => {
    const path = makePath([
      { type: 'line', length: 100 },
      { type: 'curve', length: 50 },
    ])
    const exec = makeExecution(path, 1, 0)
    expect(computeDistToNextCurve(exec)).toBe(0)
  })

  it('returns null jika curve sudah terlewati (hanya ada line setelah posisi saat ini)', () => {
    const path = makePath([
      { type: 'curve', length: 50 },
      { type: 'line', length: 100 },
    ])
    const exec = makeExecution(path, 1, 20)
    expect(computeDistToNextCurve(exec)).toBeNull()
  })
})

// ─── computeTargetSpeed ────────────────────────────────────────────────────

describe('computeTargetSpeed', () => {
  const config = {
    acceleration: 50,
    deceleration: 100,
    maxSpeed: 200,
    minCurveSpeed: 50,
  }

  it('returns maxSpeed ketika jauh dari arrival dan tidak ada curve', () => {
    expect(computeTargetSpeed(500, null, config)).toBeCloseTo(config.maxSpeed)
  })

  it('returns 0 ketika distToArrival = 0', () => {
    expect(computeTargetSpeed(0, null, config)).toBeCloseTo(0)
  })

  it('returns nilai antara 0 dan maxSpeed saat mendekati arrival', () => {
    const target = computeTargetSpeed(50, null, config)
    expect(target).toBeGreaterThan(0)
    expect(target).toBeLessThan(config.maxSpeed)
  })

  it('physics: target speed = sqrt(2 * decel * distToArrival) saat approaching arrival', () => {
    const distToArrival = 50
    const expected = Math.sqrt(2 * config.deceleration * distToArrival)
    expect(computeTargetSpeed(distToArrival, null, config)).toBeCloseTo(expected)
  })

  it('returns maxSpeed ketika distToNextCurve besar', () => {
    expect(computeTargetSpeed(10000, 300, config)).toBeCloseTo(config.maxSpeed)
  })

  it('returns minCurveSpeed ketika distToNextCurve = 0 (sudah di curve)', () => {
    expect(computeTargetSpeed(10000, 0, config)).toBeCloseTo(config.minCurveSpeed)
  })

  it('arrival deceleration lebih prioritas dari curve jika lebih ketat', () => {
    const target = computeTargetSpeed(1, 200, config)
    expect(target).toBeLessThan(config.minCurveSpeed)
  })
})

// ─── approachSpeed ─────────────────────────────────────────────────────────

describe('approachSpeed', () => {
  it('accelerates toward target', () => {
    expect(approachSpeed(0, 200, 50, 100, 1)).toBeCloseTo(50)
  })

  it('decelerates toward target', () => {
    expect(approachSpeed(200, 50, 50, 100, 1)).toBeCloseTo(100)
  })

  it('does not overshoot target when accelerating', () => {
    expect(approachSpeed(190, 200, 50, 100, 1)).toBeCloseTo(200)
  })

  it('does not overshoot target when decelerating', () => {
    expect(approachSpeed(60, 50, 50, 100, 1)).toBeCloseTo(50)
  })

  it('returns same speed when already at target', () => {
    expect(approachSpeed(100, 100, 50, 100, 1)).toBe(100)
  })

  it('scales with deltaTime', () => {
    expect(approachSpeed(0, 200, 50, 100, 0.5)).toBeCloseTo(25)
  })
})
