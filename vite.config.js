import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cấu hình công cụ đóng gói Vite cho React
export default defineConfig({
  plugins: [react()],
})

