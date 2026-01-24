import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom'
  },
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        'vehicle-path': resolve(__dirname, 'src/index.ts'),
        'core': resolve(__dirname, 'src/core/index.ts'),
        'utils': resolve(__dirname, 'src/utils/index.ts'),
        'react': resolve(__dirname, 'src/react/index.ts')
      },
      name: 'VehiclePath',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime'
        }
      }
    }
  }
})
