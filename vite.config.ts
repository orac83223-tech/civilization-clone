import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative assets also work under a GitHub project site's /repository/ path.
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE_PATH || './', server: { port: 5173 }, preview: { port: 4173 } });
