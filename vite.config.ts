import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom domain (gochords.online) → site served at root, so base = '/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
});
