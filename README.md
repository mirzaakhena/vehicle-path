# vehicle-path2

Library untuk simulasi pergerakan kendaraan multi-axle sepanjang jalur yang terdiri dari Lines dan Curves.

## Instalasi

```bash
npm install vehicle-path2
```

## Konsep Dasar

- **Line** — segmen garis lurus antara dua titik. Kendaraan bergerak di atas line.
- **Curve** — koneksi antara dua line. Berbentuk kurva bezier, menghubungkan ujung satu line ke awal line berikutnya.
- **Vehicle** — kendaraan dengan N axle yang ditempatkan di atas sebuah line. Library tidak menyimpan daftar vehicle — itu tanggung jawab client.

Titik acuan kendaraan adalah **axle paling belakang** (`axles[N-1]`). Semua axle lainnya dihitung ke depan berdasarkan `axleSpacings`.

---

## Setup

```typescript
import { PathEngine } from 'vehicle-path2/core'

const engine = new PathEngine({
  maxWheelbase: 100,              // batas maksimum total panjang kendaraan
  tangentMode: 'proportional-40' // mode kurva bezier
})
```

---

## Manajemen Scene

### Lines

```typescript
// Tambah line
engine.addLine({ id: 'L1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } })
// → false jika ID sudah ada

// Update posisi titik
engine.updateLine('L1', { end: { x: 500, y: 0 } })
engine.updateLineEndpoint('L1', 'start', { x: 10, y: 0 })

// Rename — cascade: semua curve yang referensi 'L1' otomatis diupdate ke 'L1-new'
engine.renameLine('L1', 'L1-new')
// → { success: true } atau { success: false, error: '...' }

// Hapus — cascade: semua curve yang terhubung ke line ini ikut dihapus
engine.removeLine('L1')

// Baca semua lines
engine.lines // → Line[]
```

> **Konsekuensi `removeLine`:** Semua curve yang `fromLineId` atau `toLineId`-nya adalah line tersebut akan otomatis ikut dihapus.

> **Konsekuensi `renameLine`:** Semua curve yang `fromLineId` atau `toLineId`-nya adalah ID lama otomatis diupdate ke ID baru. Graph di-rebuild secara otomatis.

---

### Curves

Curve menghubungkan **ujung satu line** ke **awal line lain**. Tidak bisa berdiri sendiri — harus selalu mereferensi dua line yang valid.

```typescript
import type { Curve } from 'vehicle-path2/core'

// Tambah curve (returns curve id — auto-generated if not provided)
const curveId = engine.addCurve({
  id: 'c1',              // optional — auto-generated if omitted
  fromLineId: 'L1',
  toLineId: 'L2',
  fromOffset: 380,        // posisi di L1 (px dari start)
  fromIsPercentage: false,
  toOffset: 20,           // posisi di L2 (px dari start)
  toIsPercentage: false,
})

// Update curve berdasarkan id
engine.updateCurve('c1', { fromOffset: 100 })

// Hapus curve berdasarkan id
engine.removeCurve('c1')

// Baca semua curves
engine.getCurves() // → Curve[]

// Dapatkan computed bezier untuk rendering
engine.getCurveBeziers() // → Map<string, BezierCurve>
```

> **Catatan:** Curve diidentifikasi via `id` (string). Jika tidak diberikan saat `addCurve`, id otomatis di-generate.

> **Konsekuensi `removeLine`:** Curve yang terhubung ke line yang dihapus otomatis ikut terhapus. `removeLine` mengembalikan `{ success, removedCurveIds }`.

> **Path validation:** Gunakan `engine.canReach(fromLineId, fromOffset, toLineId, toOffset)` untuk mengecek apakah path ada tanpa membuat execution plan.

> **Acceleration:** Gunakan `engine.moveVehicleWithAcceleration(state, exec, accelState, config, deltaTime)` untuk movement dengan physics-based acceleration/deceleration.

---

### Muat Scene Sekaligus

```typescript
// Replace seluruh scene secara atomik
engine.setScene(lines, curves)
```

---

## Vehicle

Library menyediakan tipe dasar `VehicleDefinition`. Client bebas extend dengan field tambahan (id, name, color, dsb).

```typescript
import type { VehicleDefinition } from 'vehicle-path2/core'

// Definisi minimal
const def: VehicleDefinition = { axleSpacings: [40] } // 2 axle, jarak 40px

// Client extend sesuai kebutuhan
interface MyVehicle extends VehicleDefinition {
  id: string
  name: string
}

const truck: MyVehicle = { id: 'v1', name: 'Truck A', axleSpacings: [40, 40] } // 3 axle
```

> `axleSpacings[i]` = jarak arc-length antara `axles[i]` dan `axles[i+1]`. Array harus memiliki minimal 1 entry.

---

## Pergerakan Kendaraan

Tiga method berikut digunakan secara berurutan:

### 1. `initializeVehicle` — Tempatkan kendaraan

Hitung posisi awal semua axle di atas sebuah line.

```typescript
const state = engine.initializeVehicle(
  'L1',    // lineId: line tempat kendaraan ditempatkan
  0,       // rearOffset: jarak dari start line ke axle paling belakang (px)
  truck    // VehicleDefinition (atau object yang extends-nya)
)

// state → VehiclePathState | null (null jika lineId tidak ditemukan)
// state.axles[0]   = axle terdepan
// state.axles[N-1] = axle paling belakang (titik acuan)
// state.axleSpacings = [40, 40]
```

### 2. `preparePath` — Tentukan tujuan

Jalankan Dijkstra untuk mencari rute dari posisi saat ini ke tujuan. Dipanggil **sekali** sebelum animasi dimulai.

```typescript
const execution = engine.preparePath(
  state,    // posisi vehicle sekarang (dari initializeVehicle atau tick sebelumnya)
  'L3',     // targetLineId: line tujuan
  0.5,      // targetOffset: posisi di line tujuan
  true      // isPercentage: true = 50% dari panjang line, false = nilai absolut (px)
)

// execution → PathExecution | null (null jika tidak ada rute)
```

### 3. `moveVehicle` — Jalankan per tick

Dipanggil setiap frame di animation loop. Mengembalikan posisi baru semua axle.

```typescript
const result = engine.moveVehicle(
  state,      // posisi vehicle sekarang
  execution,  // rencana rute (dari preparePath)
  speed * deltaTime  // jarak yang ditempuh di frame ini (px)
)

state = result.state         // posisi baru → simpan untuk tick berikutnya
execution = result.execution // progress terbaru → simpan untuk tick berikutnya

if (result.arrived) {
  // Kendaraan sudah sampai tujuan
}
```

---

### Contoh Lengkap: Animation Loop

```typescript
import { PathEngine } from 'vehicle-path2/core'
import type { VehiclePathState, PathExecution } from 'vehicle-path2/core'

const engine = new PathEngine({ maxWheelbase: 100, tangentMode: 'proportional-40' })

engine.setScene(
  [
    { id: 'L1', start: { x: 0,   y: 0 }, end: { x: 400, y: 0 } },
    { id: 'L2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
  ],
  [
    { fromLineId: 'L1', toLineId: 'L2', fromOffset: 1.0, fromIsPercentage: true, toOffset: 0.0, toIsPercentage: true }
  ]
)

// Client mengelola data vehicle sendiri
const myVehicle = { id: 'v1', name: 'Truck', axleSpacings: [40] }

// 1. Tempatkan di L1, axle belakang di posisi 0
let state: VehiclePathState = engine.initializeVehicle('L1', 0, myVehicle)!

// 2. Tentukan tujuan: ujung L2
let execution: PathExecution = engine.preparePath(state, 'L2', 1.0, true)!

const speed = 80 // px/detik
let lastTime = performance.now()

function animate() {
  const now = performance.now()
  const deltaTime = (now - lastTime) / 1000 // dalam detik
  lastTime = now

  // 3. Gerakkan vehicle setiap frame
  const result = engine.moveVehicle(state, execution, speed * deltaTime)
  state = result.state
  execution = result.execution

  // Render semua axle
  for (const axle of state.axles) {
    drawCircle(axle.position.x, axle.position.y)
  }

  if (!result.arrived) {
    requestAnimationFrame(animate)
  }
}

requestAnimationFrame(animate)
```

---

## Serialisasi Scene

Hanya lines dan curves yang di-serialize oleh library. **Vehicle tidak termasuk** — persistensi vehicle adalah tanggung jawab client.

```typescript
import { serializeScene, deserializeScene } from 'vehicle-path2/core'

// Simpan scene ke JSON string
const json = serializeScene(engine.lines, engine.getCurves())

// Muat kembali
const snapshot = deserializeScene(json)
engine.setScene(snapshot.lines, snapshot.curves)
```

---

## Geometry Utilities

```typescript
import { projectPointOnLine, getValidRearOffsetRange, computeMinLineLength } from 'vehicle-path2/core'

// Proyeksikan mouse/pointer ke garis — berguna untuk hit detection
const { offset, distance } = projectPointOnLine({ x: 150, y: 10 }, line)
// offset   = jarak dari start line ke titik proyeksi (px)
// distance = jarak tegak lurus dari point ke garis (px)

// Hitung range offset yang valid untuk axle belakang agar semua axle muat di line
const [min, max] = getValidRearOffsetRange(line, myVehicle.axleSpacings)

// Hitung panjang minimum sebuah line agar semua curve offset-nya tidak keluar batas
const minLen = computeMinLineLength('L1', engine.getCurves())
```

---

## License

MIT
