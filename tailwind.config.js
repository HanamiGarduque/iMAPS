import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';
import forms from '@tailwindcss/forms';

// The dashboard already writes `animate-in fade-in slide-in-from-right-4`-style
// enter animations in ~30 places, but nothing defined those utilities, so every
// one of them was a silent no-op and the elements hard-popped into view. This
// inline plugin defines the composable subset we actually use (enter keyframes
// driven by CSS variables) without pulling in an extra dependency.
const enterAnimations = plugin(({ addUtilities, matchUtilities, theme }) => {
    addUtilities({
        '@keyframes imaps-enter': {
            from: {
                opacity: 'var(--tw-enter-opacity, 1)',
                transform:
                    'translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1))',
            },
        },
        '@keyframes imaps-fade-in': {
            from: { opacity: '0' },
            to: { opacity: '1' },
        },
        '.animate-in': {
            animationName: 'imaps-enter',
            animationDuration: 'var(--tw-animate-duration, 180ms)',
            animationTimingFunction: 'var(--tw-animate-easing, cubic-bezier(0.16, 1, 0.3, 1))',
            animationFillMode: 'both',
        },
        '.animate-fade-in': {
            animationName: 'imaps-fade-in',
            animationDuration: 'var(--tw-animate-duration, 180ms)',
            animationTimingFunction: 'var(--tw-animate-easing, cubic-bezier(0.16, 1, 0.3, 1))',
            animationFillMode: 'both',
        },
        '.fade-in': { '--tw-enter-opacity': '0' },
    });

    // fade-in-0 … fade-in-100 (percentage the element starts at)
    matchUtilities(
        { 'fade-in': (value) => ({ '--tw-enter-opacity': String(Number(value) / 100) }) },
        { values: { 0: '0', 25: '25', 50: '50', 75: '75', 100: '100' } }
    );

    // zoom-in-95 etc. (percentage the element starts scaled at)
    matchUtilities(
        { 'zoom-in': (value) => ({ '--tw-enter-scale': String(Number(value) / 100) }) },
        { values: { 50: '50', 75: '75', 90: '90', 95: '95', 100: '100', 105: '105', 110: '110' } }
    );

    // slide-in-from-{top,bottom,left,right}-N, resolved against the spacing scale
    const spacing = theme('spacing');
    matchUtilities(
        {
            'slide-in-from-top': (value) => ({ '--tw-enter-translate-y': `-${value}` }),
            'slide-in-from-bottom': (value) => ({ '--tw-enter-translate-y': value }),
            'slide-in-from-left': (value) => ({ '--tw-enter-translate-x': `-${value}` }),
            'slide-in-from-right': (value) => ({ '--tw-enter-translate-x': value }),
        },
        { values: spacing }
    );

    // Tailwind's own `duration-*` only drives transition-duration. tailwindcss-animate
    // makes it drive animation-duration too, and the call sites here assume that
    // (`animate-in fade-in duration-150`), so mirror the behaviour onto our variable.
    matchUtilities(
        {
            duration: (value) => ({
                '--tw-animate-duration': value,
                transitionDuration: value,
            }),
        },
        { values: theme('transitionDuration') }
    );

    // A municipal dashboard runs on shared LGU machines; honour the OS setting.
    addUtilities({
        '@media (prefers-reduced-motion: reduce)': {
            '.animate-in, .animate-fade-in': {
                animation: 'none !important',
            },
        },
    });
});

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/views/**/*.blade.php',
        './resources/js/**/*.jsx',
    ],

    theme: {
        extend: {
            fontFamily: {
                sans: ['Poppins', ...defaultTheme.fontFamily.sans],
            },
        },
    },

    plugins: [forms, enterAnimations],
};
