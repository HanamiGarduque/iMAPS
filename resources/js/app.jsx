import { createInertiaApp, router } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers'
import PageLoader from './Components/PageLoader'
import './bootstrap'
import '../css/app.css'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'

router.on('invalid', (event) => {
    if (event.detail.response && event.detail.response.status === 419) {
        event.preventDefault();
        window.location.reload();
    }
});

// A page frame marked overflow-hidden can still be scrolled by the browser:
// focusing or scrolling-into-view something inside it slides the whole page
// up and leaves a blank band below. Frames that are not meant to scroll are
// put back where they belong, on every page. Small clipped boxes (text
// truncation, sliders) are left alone.
document.addEventListener('scroll', (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement) || el.clientHeight < 200) return
    const style = getComputedStyle(el)
    if (style.overflowY === 'hidden' || style.overflowY === 'clip') { if (el.scrollTop) el.scrollTop = 0 }
    if (style.overflowX === 'hidden' || style.overflowX === 'clip') { if (el.scrollLeft && el.clientWidth >= 200) el.scrollLeft = 0 }
}, true)

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
        // Tells the launch splash in app.blade.php that the page underneath is ready.
        requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('imaps:ready'))))
    },
    // The top progress bar is replaced by the centred loading bubble in PageLoader.
    progress: false,
})