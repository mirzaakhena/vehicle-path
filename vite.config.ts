import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true
  },
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        'vehicle-path': resolve(__dirname, 'src/index.ts'),
        'core': resolve(__dirname, 'src/core/index.ts')
      },
      name: 'VehiclePath',
      formats: ['es', 'cjs']
    }
  }
})
