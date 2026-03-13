# Free Curve Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hapus batasan `maxWheelbase` dari penempatan curve, sehingga user bisa menempatkan curve di mana saja pada suatu line.

**Architecture:**
Perubahan dibagi menjadi dua layer. Layer pertama adalah demo (UI-only, zero risk) — hapus bounds check `wb` dari Canvas. Layer kedua adalah library (breaking change) — ubah semantic `resolveFromLineOffset` dan `resolveToLineOffset` agar tidak lagi shift/clamp berdasarkan `maxWheelbase`. Library changes memerlukan TDD karena kedua fungsi belum punya test coverage.

**Konsekuensi yang disengaja:** Vehicle yang terlalu panjang untuk melewati curve yang terlalu dekat ke ujung line akan diam saja (return null dari `prepareCommandPath`) — ini expected behavior.

**Tech Stack:** TypeScript, Vitest, React 19, vehicle-path-demo (Vite + React)

---

## Task 1: Demo — Hapus batasan from-point curve placement

> **Prioritas: Paling aman.** Hanya mengubah UI bounds check. Tidak ada perubahan logic, tidak ada perubahan library. Fully reversible.

**Files:**
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx`

**Konteks:**
Saat ini ada dua tempat di Canvas yang membatasi from-point ke `>= wb`:
1. Line 315: hover preview saat user belum drag (mode `curve`)
2. Line 481: hover saat tidak ada curveDrag aktif

**Step 1: Hapus constraint `>= wb` untuk from-point hover**

Di `Canvas.tsx`, cari blok ini (sekitar line 312–326):
```typescript
// ── Curve mode ──
if (mode === 'curve') {
  const hit = findLineHit(mouse)
  if (hit) {
    const len = getLineLength(hit.line)
    const wb  = maxWheelbaseRef.current
    if (hit.offset >= wb && hit.offset <= len) {   // ← hapus `hit.offset >= wb &&`
      setCurveDrag({ ... })
```

Ganti kondisi menjadi:
```typescript
    if (hit.offset <= len) {
```

Di blok kedua (sekitar line 476–484):
```typescript
    const len = getLineLength(hit.line)
    const wb  = maxWheelbaseRef.current
    if (hit.offset >= wb && hit.offset <= len) {   // ← hapus `hit.offset >= wb &&`
      setCurveHover(...)
```

Ganti kondisi menjadi:
```typescript
    if (hit.offset <= len) {
```

Setelah kedua perubahan, variabel `const wb = maxWheelbaseRef.current` di kedua blok ini menjadi unused — hapus juga baris tersebut.

**Step 2: Verifikasi TypeScript**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```
Expected: EXIT 0, tidak ada error.

**Step 3: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "feat: allow curve from-point placement anywhere on line"
```

---

## Task 2: Demo — Hapus batasan to-point curve placement

> **Prioritas: Aman.** UI-only change seperti Task 1. Tidak ada perubahan library.

**Files:**
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx`

**Konteks:**
Ada dua tempat yang membatasi to-point ke `<= lineLength - wb`:
1. Drag `curve-to` di `activeDrag` handler (sekitar line 390–406)
2. Drag `curveDrag.toHover` dalam `handleMouseMove` (sekitar line 453–469)

**Step 1: Hapus constraint to-point pada `curve-to` drag**

Cari blok ini (sekitar line 387–406):
```typescript
} else if (activeDrag.type === 'curve-to') {
  ...
  const { offset } = projectPointOnLine(mouse, toLine)
  const toLen      = getLineLength(toLine)
  const validMax   = toLen - wb        // ← hapus baris ini
  if (validMax > 0) {                  // ← ganti kondisi
    const clamped = Math.max(0, Math.min(offset, validMax))   // ← ganti validMax
```

Ganti menjadi:
```typescript
} else if (activeDrag.type === 'curve-to') {
  ...
  const { offset } = projectPointOnLine(mouse, toLine)
  const toLen      = getLineLength(toLine)
  const clamped = Math.max(0, Math.min(offset, toLen))
  try {
    const bezier = createBezierCurve(...)
    onCurveUpdate({ ...curve, toOffset: clamped, bezier })
  } catch { /* degenerate geometry — skip */ }
```

**Step 2: Hapus constraint to-point pada `curveDrag` hover**

Cari blok ini (sekitar line 453–471):
```typescript
const len      = getLineLength(hit.line)
const validMax = len - wb                               // ← hapus
if (validMax > 0 && hit.offset >= 0 && hit.offset <= validMax) {   // ← ganti
```

Ganti menjadi:
```typescript
const len = getLineLength(hit.line)
if (hit.offset >= 0 && hit.offset <= len) {
```

**Step 3: Verifikasi TypeScript**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```
Expected: EXIT 0.

**Step 4: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "feat: allow curve to-point placement anywhere on line"
```

---

## Task 3: Demo — Fix `computeMinLineLength`

> **Prioritas: Aman.** Perubahan kecil pada fungsi helper. Menghapus `+ wb` yang tidak lagi diperlukan setelah Task 1-2.

**Files:**
- Modify: `C:/Users/Mirza/workspace/vehicle-path-demo/src/components/Canvas.tsx`

**Konteks:**
`computeMinLineLength` mencegah line diperpendek sampai curve offset jadi invalid. Dengan tidak adanya batasan wb, to-line minimum hanya perlu cukup panjang untuk menampung `toOffset`, bukan `toOffset + wb`.

**Step 1: Hapus `+ wb` dari to-line calculation**

Cari fungsi ini (sekitar line 204–216):
```typescript
function computeMinLineLength(lineId: string): number {
  const wb = maxWheelbaseRef.current
  let min = 5
  for (const curve of curvesRef.current) {
    if (curve.fromLineId === lineId) {
      min = Math.max(min, curve.fromOffset)
    }
    if (curve.toLineId === lineId) {
      min = Math.max(min, curve.toOffset + wb)  // ← hapus + wb
    }
  }
  return min
}
```

Ganti menjadi:
```typescript
function computeMinLineLength(lineId: string): number {
  let min = 5
  for (const curve of curvesRef.current) {
    if (curve.fromLineId === lineId) {
      min = Math.max(min, curve.fromOffset)
    }
    if (curve.toLineId === lineId) {
      min = Math.max(min, curve.toOffset)
    }
  }
  return min
}
```

Karena `wb` tidak lagi dipakai di sini, cek apakah `maxWheelbaseRef` masih dipakai di tempat lain di Canvas — jika masih (untuk vehicle placement), biarkan. Jika tidak ada lagi yang pakai, hapus ref-nya.

**Step 2: Verifikasi TypeScript**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```
Expected: EXIT 0.

**Step 3: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "fix: remove maxWheelbase from computeMinLineLength for to-line curves"
```

---

## Task 4: Library — Tulis tests untuk `resolveFromLineOffset` dan `resolveToLineOffset`

> **Prioritas: Medium.** Ini adalah persiapan TDD sebelum mengubah behavior library. Kedua fungsi ini **belum punya test sama sekali**. Harus ada test dulu sebelum mengubah implementasinya.

**Files:**
- Modify: `src/core/algorithms/__tests__/pathFinding.test.ts`

**Konteks tentang behavior saat ini yang akan DIUBAH:**
- `resolveFromLineOffset` dengan absolute offset: menambahkan `maxWheelbase` ke offset (e.g., offset=200, wb=50 → return 250). Ini akan diubah ke: return offset apa adanya, clamped ke `[0, lineLength]`.
- `resolveFromLineOffset` dengan percentage: maps `0% → wb, 100% → lineLength`. Akan diubah ke `0% → 0, 100% → lineLength`.
- `resolveToLineOffset` dengan absolute offset: clamps ke `[0, lineLength - wb]`. Akan diubah ke clamp `[0, lineLength]`.
- `resolveToLineOffset` dengan percentage: maps `0% → 0, 100% → lineLength - wb`. Akan diubah ke `0% → 0, 100% → lineLength`.

**Step 1: Tambah tests untuk behavior BARU (akan FAIL dulu)**

Di `src/core/algorithms/__tests__/pathFinding.test.ts`, tambah describe block baru:

```typescript
import { resolveFromLineOffset, resolveToLineOffset } from '../pathFinding'
import type { Line } from '../../types/geometry'

describe('resolveFromLineOffset', () => {
  const line: Line = { id: 'l1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }
  // lineLength = 400, maxWheelbase = 50

  it('absolute: returns offset as-is, clamped to [0, lineLength]', () => {
    expect(resolveFromLineOffset(line, 200, false, 1, 50)).toBe(200)
    expect(resolveFromLineOffset(line, 0,   false, 1, 50)).toBe(0)
    expect(resolveFromLineOffset(line, 400, false, 1, 50)).toBe(400)
    expect(resolveFromLineOffset(line, 500, false, 1, 50)).toBe(400) // clamp to lineLength
  })

  it('percentage: maps 0→0, 1→lineLength regardless of maxWheelbase', () => {
    expect(resolveFromLineOffset(line, 0,   true, 1, 50)).toBe(0)
    expect(resolveFromLineOffset(line, 1,   true, 1, 50)).toBe(400)
    expect(resolveFromLineOffset(line, 0.5, true, 1, 50)).toBe(200)
  })

  it('undefined offset: uses defaultPercentage, maps to [0, lineLength]', () => {
    expect(resolveFromLineOffset(line, undefined, undefined, 1.0, 50)).toBe(400)
    expect(resolveFromLineOffset(line, undefined, undefined, 0.0, 50)).toBe(0)
    expect(resolveFromLineOffset(line, undefined, undefined, 0.5, 50)).toBe(200)
  })
})

describe('resolveToLineOffset', () => {
  const line: Line = { id: 'l1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }
  // lineLength = 400, maxWheelbase = 50

  it('absolute: returns offset as-is, clamped to [0, lineLength]', () => {
    expect(resolveToLineOffset(line, 200, false, 0, 50)).toBe(200)
    expect(resolveToLineOffset(line, 0,   false, 0, 50)).toBe(0)
    expect(resolveToLineOffset(line, 400, false, 0, 50)).toBe(400)
    expect(resolveToLineOffset(line, 500, false, 0, 50)).toBe(400) // clamp to lineLength
  })

  it('percentage: maps 0→0, 1→lineLength regardless of maxWheelbase', () => {
    expect(resolveToLineOffset(line, 0,   true, 0, 50)).toBe(0)
    expect(resolveToLineOffset(line, 1,   true, 0, 50)).toBe(400)
    expect(resolveToLineOffset(line, 0.5, true, 0, 50)).toBe(200)
  })

  it('undefined offset: uses defaultPercentage, maps to [0, lineLength]', () => {
    expect(resolveToLineOffset(line, undefined, undefined, 0.0, 50)).toBe(0)
    expect(resolveToLineOffset(line, undefined, undefined, 1.0, 50)).toBe(400)
    expect(resolveToLineOffset(line, undefined, undefined, 0.5, 50)).toBe(200)
  })
})
```

**Step 2: Run tests — harus FAIL**
```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run src/core/algorithms/__tests__/pathFinding.test.ts
```
Expected: beberapa test FAIL (karena behavior belum diubah).

**Step 3: Commit tests**
```bash
git add src/core/algorithms/__tests__/pathFinding.test.ts
git commit -m "test: add failing tests for new resolveFromLineOffset/resolveToLineOffset behavior"
```

---

## Task 5: Library — Implementasi perubahan `resolveFromLineOffset` dan `resolveToLineOffset`

> **Prioritas: Krusial.** Ini adalah breaking change pada public API library. Consumer yang menggunakan percentage-based offsets akan mendapatkan posisi curve yang berbeda. Butuh major/minor version bump.

**Files:**
- Modify: `src/core/algorithms/pathFinding.ts`
- Modify: `package.json`

**Step 1: Ganti implementasi `resolveFromLineOffset`**

Di `src/core/algorithms/pathFinding.ts`, ganti keseluruhan fungsi `resolveFromLineOffset`:

```typescript
/**
 * Resolve offset untuk FROM line (garis asal kurva).
 * Kurva bisa ditempatkan di mana saja pada line: range [0, lineLength].
 *
 * Untuk absolute offset: clamp ke [0, lineLength].
 * Untuk percentage (0-1): map ke [0, lineLength].
 */
export function resolveFromLineOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number,
  maxWheelbase: number   // kept for API compatibility, no longer used
): number {
  const lineLength = distance(line.start, line.end)

  if (offset === undefined) {
    return defaultPercentage * lineLength
  }

  if (isPercentage) {
    return Math.max(0, Math.min(offset, 1)) * lineLength
  }

  return Math.max(0, Math.min(offset, lineLength))
}
```

**Step 2: Ganti implementasi `resolveToLineOffset`**

```typescript
/**
 * Resolve offset untuk TO line (garis tujuan kurva).
 * Kurva bisa ditempatkan di mana saja pada line: range [0, lineLength].
 *
 * Untuk absolute offset: clamp ke [0, lineLength].
 * Untuk percentage (0-1): map ke [0, lineLength].
 */
export function resolveToLineOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number,
  maxWheelbase: number   // kept for API compatibility, no longer used
): number {
  const lineLength = distance(line.start, line.end)

  if (offset === undefined) {
    return defaultPercentage * lineLength
  }

  if (isPercentage) {
    return Math.max(0, Math.min(offset, 1)) * lineLength
  }

  return Math.max(0, Math.min(offset, lineLength))
}
```

**Step 3: Run tests — harus PASS**
```bash
cd C:/Users/Mirza/workspace/vehicle-path
npx vitest run src/core/algorithms/__tests__/pathFinding.test.ts
```
Expected: semua test PASS.

**Step 4: Run full test suite**
```bash
npx vitest run
```
Expected: semua PASS. Jika ada test yang fail, investigasi — kemungkinan ada test lain yang bergantung pada behavior lama.

**Step 5: Bump versi**

Di `package.json`:
```json
"version": "2.2.0"
```
(minor bump — perubahan behavior tapi tidak menghapus API, `maxWheelbase` param masih ada)

**Step 6: Build**
```bash
npm run build
```
Expected: build sukses.

**Step 7: Commit**
```bash
git add src/core/algorithms/pathFinding.ts package.json
git commit -m "feat!: remove maxWheelbase constraint from resolveFromLineOffset and resolveToLineOffset

Curves can now be placed anywhere on a line [0, lineLength].
maxWheelbase param is kept for API compatibility but no longer affects offset resolution.
Vehicles that cannot reach a curve due to insufficient line space will simply not move (prepareCommandPath returns null).

BREAKING CHANGE: percentage-based offsets now map to full line range [0, lineLength]
instead of [wb, lineLength] (from) and [0, lineLength-wb] (to)."
```

---

## Ringkasan Prioritas

| Task | Target | Risiko | Breaking? |
|------|--------|--------|-----------|
| 1. Hapus from-point bounds | Demo Canvas | Nol | Tidak |
| 2. Hapus to-point bounds | Demo Canvas | Rendah | Tidak |
| 3. Fix computeMinLineLength | Demo Canvas | Rendah | Tidak |
| 4. Tulis tests | Library | Nol (TDD prep) | Tidak |
| 5. Ubah resolve functions | Library | **Krusial** | **Ya** (percentage users) |
