# vehicle-path2

Library untuk simulasi pergerakan kendaraan dual-axle sepanjang jalur.

## Instalasi

```bash
npm install vehicle-path2
```

## Quick Start

```tsx
import { useVehicleSimulation } from 'vehicle-path2/react'

function App() {
  const sim = useVehicleSimulation({ wheelbase: 30 })

  // Buat jalur
  sim.addLine({ id: 'line1', start: [0, 0], end: [400, 0] })
  sim.addLine({ id: 'line2', start: [400, 0], end: [400, 300] })
  sim.connect('line1', 'line2')

  // Tambah kendaraan
  sim.addVehicles({ id: 'v1', lineId: 'line1', position: 0 })

  // Gerakkan ke tujuan
  sim.goto({ id: 'v1', lineId: 'line2', position: 1.0 })

  // Jalankan animasi
  sim.prepare()
  sim.tick(5) // panggil di animation loop
}
```

## API

### Format Posisi

Semua nilai posisi menggunakan format **0-1** untuk persentase:
- `0` = 0% (awal line)
- `0.5` = 50% (tengah line)
- `1` = 100% (ujung line)

Untuk posisi absolut (dalam satuan koordinat), gunakan `isPercentage: false`.

### Setup

```ts
const sim = useVehicleSimulation({
  wheelbase: 30,                    // jarak antar roda
  tangentMode: 'proportional-40'    // mode kurva (opsional)
})
```

### Scene

```ts
sim.addLine({ id: 'line1', start: [0, 0], end: [400, 0] })
sim.updateLine('line1', { end: [500, 100] })
sim.removeLine('line1')
sim.clearScene()
```

### Koneksi

```ts
sim.connect('line1', 'line2')
sim.connect('line1', 'line2', { fromOffset: 0.8, toOffset: 0.2 })
sim.connect('line1', 'line2', { fromOffset: 150, fromIsPercentage: false, toOffset: 50, toIsPercentage: false })
sim.updateConnection('line1', 'line2', { fromOffset: 0.5 })              // update offset
sim.updateConnection('line1', 'line2', { toOffset: 100, toIsPercentage: false }) // absolute
sim.disconnect('line1', 'line2')
```

### Kendaraan

```ts
sim.addVehicles({ id: 'v1', lineId: 'line1', position: 0 })
sim.addVehicles({ id: 'v2', lineId: 'line1', position: 150, isPercentage: false }) // absolute
sim.updateVehicle('v1', { position: 0.5 })                    // pindah ke 50%
sim.updateVehicle('v1', { lineId: 'line2' })                  // pindah ke line lain
sim.updateVehicle('v1', { lineId: 'line2', position: 0.8 })   // pindah ke 80% di line2
sim.removeVehicle('v1')
sim.clearVehicles()
```

### Pergerakan

```ts
sim.goto({ id: 'v1', lineId: 'line2' })                // default position = 1.0 (ujung)
sim.goto({ id: 'v1', lineId: 'line2', position: 0.5 }) // 0.5 = tengah line
sim.goto({ id: 'v1', lineId: 'line2', position: 150, isPercentage: false }) // absolute
sim.goto({ id: 'v1', lineId: 'line2', position: 0.5, wait: true })          // berhenti di tujuan
sim.goto({ id: 'v1', lineId: 'line2', payload: { orderId: '123' } })        // dengan payload
sim.clearQueue('v1')
```

### Animasi

```ts
sim.prepare()              // siapkan sebelum animasi
sim.tick(5)                // gerakkan 5 pixel per tick
sim.reset()                // kembali ke posisi awal
sim.isMoving()             // cek ada yang bergerak
sim.continueVehicle('v1')  // lanjutkan vehicle yang wait
```

### Load dari DSL

```ts
sim.loadFromDSL(`
  line1 : (0, 0) -> (400, 0)
  line2 : (400, 0) -> (400, 300)
  line1 -> line2
`)
```

### State

```ts
sim.lines          // semua line
sim.curves         // semua koneksi
sim.vehicles       // kendaraan (posisi awal)
sim.movingVehicles // kendaraan (posisi saat animasi)
```

## Contoh Lengkap

```tsx
import { useVehicleSimulation } from 'vehicle-path2/react'
import { useEffect } from 'react'

function AnimatedVehicle() {
  const sim = useVehicleSimulation({ wheelbase: 30 })

  useEffect(() => {
    sim.addLine({ id: 'line1', start: [100, 100], end: [500, 100] })
    sim.addVehicles({ id: 'v1', lineId: 'line1', position: 0 })
    sim.goto({ id: 'v1', lineId: 'line1', position: 1.0 })
    sim.prepare()

    const animate = () => {
      if (sim.tick(3)) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [])

  return (
    <svg width={600} height={200}>
      {sim.movingVehicles.map(v => (
        <circle
          key={v.id}
          cx={v.rear.position.x}
          cy={v.rear.position.y}
          r={10}
          fill="blue"
        />
      ))}
    </svg>
  )
}
```

## License

MIT
