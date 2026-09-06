import { defineConfig } from 'vite'
import laravel from 'laravel-vite-plugin'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.jsx'],
            refresh: true,
        }),
        react(),
    ],
    server: {
        watch: {
            // Merged all ignored patterns into a single array
            ignored: [
                '**/public/tiles/**',
                '**/python-analytics/**',
                '**/ml_service/**',
                '**/.venv/**',
                '**/venv/**',
            ],
        },
    },
})