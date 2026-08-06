import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_IS_GH_PAGES === 'true' ? '/TrackLocation/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Delivery Tracker',
        short_name: 'Tracker',
        description: 'Delivery Driver GPS Tracking App',
        theme_color: '#3b82f6',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/1048/1048315.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
