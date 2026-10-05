import { createInertiaApp, router } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers'
import PageLoader from './Components/PageLoader'
import './bootstrap'
import '../css/app.css'

router.on('invalid', (event) => {
    if (event.detail.response && event.detail.response.status === 419) {
        event.preventDefault();
        window.location.reload();
    }
});

createInertiaApp({
    resolve: name =>
        resolvePageComponent(
            `./Pages/${name}.jsx`,
            import.meta.glob('./Pages/**/*.jsx')
        ),
    setup({ el, App, props }) {
        createRoot(el).render(
            <>
                <App {...props} />
                <PageLoader />
            </>
        )
    },
    // The top progress bar is replaced by the centred loading bubble in PageLoader.
    progress: false,
})