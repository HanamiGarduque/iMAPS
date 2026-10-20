<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Loop 6: no cached CSRF meta tag. CSRF relies on the Laravel XSRF
         cookie plus Axios' standard XSRF behavior. Re-adding a cached meta
         token reintroduces the stale-token 419 failure. -->
    <link rel="icon" type="image/png" sizes="128x128" href="{{ asset('branding/favicon-white-128.png') }}?v=4">
    <link rel="icon" type="image/svg+xml" sizes="any" href="{{ asset('branding/favicon-white.svg') }}?v=4">
    <link rel="apple-touch-icon" sizes="180x180" href="{{ asset('branding/apple-touch-icon-transparent.png') }}">

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
    @if (request()->is('login'))
    {{-- Launch splash: plain HTML/CSS/SVG so it paints before the JS bundle loads. Removed by the script below. --}}
    <style>
        html.splash-on, html.splash-on body { overflow: hidden; background: #2347d5; }
        #launch-splash { position: fixed; inset: 0; z-index: 2147483000; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: #fff; font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; }
        #launch-splash .ls-bg { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, #2f58e6 0%, #2347d5 52%, #1a37b0 100%); }
        /* Hand-off: everything but the logo fades, then the logo flies into the navbar (see script) */
        #launch-splash .ls-bg, #launch-splash .ls-grid, #launch-splash .ls-glow, #launch-splash .ls-name, #launch-splash .ls-status, #launch-splash .ls-comet, #launch-splash .ls-svg { transition: opacity .45s ease; }
        #launch-splash.is-leaving .ls-grid, #launch-splash.is-leaving .ls-glow, #launch-splash.is-leaving .ls-name, #launch-splash.is-leaving .ls-status, #launch-splash.is-leaving .ls-comet { opacity: 0 !important; animation: none; }
        #launch-splash.is-leaving .ls-bg { opacity: 0; transition-duration: 1.1s; transition-delay: .35s; transition-timing-function: cubic-bezier(.4,0,.2,1); }
        #launch-splash .ls-final { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity .7s ease .5s; }
        #launch-splash.is-leaving .ls-final { opacity: 1; }
        #launch-splash.is-leaving .ls-svg { opacity: 0; transition-duration: .7s; transition-delay: .5s; filter: none; }
        /* Landing on a white logo (e.g. on a blue header): stay white instead of turning navy. */
        #launch-splash.no-lettering #custom-imaps-lettering { transition: opacity .6s ease .15s; }
        #launch-splash.no-lettering.is-leaving #custom-imaps-lettering { opacity: 0; }
        #launch-splash.keep-white.is-leaving .ls-final { opacity: 0; }
        #launch-splash.keep-white.is-leaving .ls-svg { opacity: 1; }
        html.splash-flying img[data-nav-logo] { opacity: 0; }

        /* Faint map grid, fading out towards the edges */
        #launch-splash .ls-grid { position: absolute; inset: 0; opacity: 0; background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 72px 72px; -webkit-mask-image: radial-gradient(ellipse at 50% 42%, #000 0%, transparent 68%); mask-image: radial-gradient(ellipse at 50% 42%, #000 0%, transparent 68%); animation: ls-fade-in 1.2s ease .2s forwards; }
        #launch-splash .ls-glow { position: absolute; left: 50%; top: 42%; width: min(90vh, 760px); aspect-ratio: 1; margin: calc(min(90vh, 760px) / -2) 0 0 calc(min(90vh, 760px) / -2); border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.2) 0%, rgba(255,255,255,0) 62%); opacity: 0; animation: ls-glow 3.4s ease-in-out 1s infinite; }

        /* Comet: a dot with a fading tail travels along an arc before the logo draws in */
        #launch-splash .ls-comet { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; animation: ls-fade-out .5s ease 1.8s forwards; }

        #launch-splash .ls-mark { position: relative; width: min(46vh, 360px, 64vw); aspect-ratio: 887 / 1165; margin-top: -2vh; }
        #launch-splash .ls-svg { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 18px 34px rgba(8,22,84,.35)); }

        /* Each ridge draws as an outline (staggered, outer to inner), then fills in */
        #launch-splash #fingerprint path { fill: rgba(255,255,255,.1); stroke: #fff; stroke-width: 3.6; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: ls-draw 1s cubic-bezier(.5,.1,.2,1) var(--d) forwards, ls-fill .7s ease calc(var(--d) + .6s) forwards; }
        #launch-splash #fingerprint path:nth-of-type(1) { --d: 1.0s; }
        #launch-splash #fingerprint path:nth-of-type(2) { --d: 1.1s; }
        #launch-splash #fingerprint path:nth-of-type(3) { --d: 1.2s; }
        #launch-splash #fingerprint path:nth-of-type(4) { --d: 1.3s; }
        #launch-splash #fingerprint path:nth-of-type(5) { --d: 1.4s; }
        #launch-splash #fingerprint path:nth-of-type(6) { --d: 1.5s; }
        #launch-splash #fingerprint path:nth-of-type(7) { --d: 1.6s; }
        #launch-splash #fingerprint path:nth-of-type(8) { --d: 1.7s; }
        #launch-splash #fingerprint path:nth-of-type(9) { --d: 1.8s; }
        #launch-splash #pin-eye { opacity: 0; animation: ls-fade-in .4s ease 1.75s forwards; }

        /* Parcel squares appear last, the identified one slightly after */
        #launch-splash #parcel-overlays path { opacity: 0; animation: ls-fade-in .5s ease var(--d) forwards; }
        #launch-splash #parcel-overlays path:nth-of-type(1) { --d: 2.5s; }
        #launch-splash #parcel-overlays path:nth-of-type(2) { --d: 2.58s; }
        #launch-splash #parcel-overlays path:nth-of-type(3) { --d: 2.66s; }
        #launch-splash #parcel-overlays path:nth-of-type(4) { --d: 2.74s; }
        #launch-splash #parcel-overlays path:nth-of-type(5) { --d: 2.82s; }
        #launch-splash #parcel-overlays path:nth-of-type(6) { --d: 2.9s; }
        #launch-splash #parcel-overlays path:nth-of-type(7) { --d: 2.98s; }
        #launch-splash #parcel-overlays path:nth-of-type(8) { --d: 3.06s; }
        #launch-splash #parcel-overlays path:nth-of-type(9) { --d: 3.14s; }
        #launch-splash #parcel-overlays path#found-parcel { --d: 3.3s; }

        /* iMAPS lettering writes itself letter by letter */
        #launch-splash #custom-imaps-lettering path { fill-opacity: 0; stroke: #fff; stroke-width: 2.4; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: ls-draw .8s ease var(--d) forwards, ls-fill-text .5s ease calc(var(--d) + .5s) forwards; }
        #launch-splash #custom-imaps-lettering circle { opacity: 0; animation: ls-fade-in .4s ease var(--d) forwards; }
        #launch-splash #letter-i { --d: 2.1s; }
        #launch-splash #letter-M { --d: 2.22s; }
        #launch-splash #letter-A { --d: 2.34s; }
        #launch-splash #letter-P { --d: 2.46s; }
        #launch-splash #letter-S { --d: 2.58s; }

        #launch-splash .ls-name { margin-top: 38px; text-align: center; opacity: 0; font-size: 12px; font-weight: 600; letter-spacing: .5em; text-transform: uppercase; color: rgba(255,255,255,.86); animation: ls-name 1.2s cubic-bezier(.2,.7,.2,1) 2.7s forwards; }
        #launch-splash .ls-name::before { content: ''; display: block; width: 36px; height: 1px; margin: 0 auto 16px; background: rgba(255,255,255,.5); }

        #launch-splash .ls-status { position: absolute; left: 0; right: 0; bottom: 40px; display: flex; flex-direction: column; align-items: center; gap: 12px; font-size: 12px; font-weight: 500; letter-spacing: .04em; color: rgba(255,255,255,.7); opacity: 0; animation: ls-fade-in .6s ease .8s forwards; }
        #launch-splash .ls-bar { position: relative; width: 132px; height: 2px; border-radius: 2px; overflow: hidden; background: rgba(255,255,255,.2); }
        #launch-splash .ls-bar::after { content: ''; position: absolute; top: 0; bottom: 0; width: 44%; border-radius: 2px; background: #fff; animation: ls-bar 1.3s cubic-bezier(.6,0,.4,1) infinite; }

        @keyframes ls-draw { to { stroke-dashoffset: 0; } }
        @keyframes ls-fill { to { fill: #fff; stroke-opacity: 0; } }
        @keyframes ls-fill-text { to { fill-opacity: 1; stroke-opacity: 0; } }
        @keyframes ls-fade-in { to { opacity: 1; } }
        @keyframes ls-fade-out { to { opacity: 0; } }
        @keyframes ls-glow { 0%, 100% { opacity: .45; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.04); } }
        @keyframes ls-name { from { opacity: 0; letter-spacing: .85em; } to { opacity: 1; letter-spacing: .5em; } }
        @keyframes ls-bar { from { left: -44%; } to { left: 100%; } }

        @media (max-width: 520px) { #launch-splash .ls-name { font-size: 10px; letter-spacing: .3em; padding: 0 24px; } @keyframes ls-name { from { opacity: 0; } to { opacity: 1; } } }
        @media (prefers-reduced-motion: reduce) {
            #launch-splash *, #launch-splash *::before, #launch-splash *::after { animation: none !important; }
            #launch-splash .ls-comet { display: none; }
            #launch-splash .ls-grid, #launch-splash .ls-glow, #launch-splash .ls-name, #launch-splash .ls-status, #launch-splash #pin-eye, #launch-splash #parcel-overlays path, #launch-splash #custom-imaps-lettering circle { opacity: 1; }
            #launch-splash #fingerprint path { fill: #fff; stroke: none; stroke-dashoffset: 0; }
            #launch-splash #custom-imaps-lettering path { fill-opacity: 1; stroke: none; stroke-dashoffset: 0; }
            #launch-splash .ls-bar::after { left: 28%; }
        }
    </style>
    <script>document.documentElement.classList.add('splash-on');</script>
    @endif
    @inertiaHead
</head>
<body>
    @if (request()->is('login'))
    <div id="launch-splash" role="status" aria-live="polite">
        <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Loading iMAPS</span>
        <div class="ls-bg" aria-hidden="true"></div>
        <div class="ls-grid" aria-hidden="true"></div>
        <div class="ls-glow" aria-hidden="true"></div>
        <div class="ls-mark" aria-hidden="true">
            <img class="ls-final" src="{{ asset('branding/imaps-logo.svg') }}" alt="">
            {!! preg_replace(['/<\?xml.*?\?>/s', '/<title.*?<\/title>/s', '/<desc.*?<\/desc>/s', '/<svg [^>]*>/'], ['', '', '', '<svg class="ls-svg" xmlns="http://www.w3.org/2000/svg" viewBox="212 69 887 1165" aria-hidden="true">'], file_get_contents(public_path('branding/imaps-splash.svg')), 1) !!}
            {{-- Same coordinate space as the logo, so the comet lands exactly on the pin dot (716, 767). --}}
            <svg class="ls-comet" viewBox="212 69 887 1165" aria-hidden="true">
                <path d="M -1100 1700 C -300 1560 330 1230 716 767" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="5" stroke-linecap="round"/>
                <path d="M -1100 1700 C -300 1560 330 1230 716 767" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" pathLength="1" stroke-dasharray=".2 3" stroke-dashoffset=".2" opacity="0">
                    <set attributeName="opacity" to="1" begin=".15s"/>
                    <animate attributeName="stroke-dashoffset" from=".2" to="-.8" dur="1.6s" begin=".15s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 .05 .25 1"/>
                </path>
                <g opacity="0">
                    <set attributeName="opacity" to="1" begin=".15s"/>
                    <circle r="50" fill="rgba(239,68,68,.3)"/>
                    <circle r="22" fill="#ef4444"/>
                    <circle r="8" fill="#fff"/>
                    <animateMotion path="M -1100 1700 C -300 1560 330 1230 716 767" dur="1.6s" begin=".15s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 .05 .25 1"/>
                </g>
                <circle cx="716" cy="767" r="0" fill="none" stroke="#ef4444" stroke-width="6" opacity="0">
                    <animate attributeName="r" from="20" to="150" dur=".9s" begin="1.75s" fill="freeze"/>
                    <animate attributeName="opacity" from=".9" to="0" dur=".9s" begin="1.75s" fill="freeze"/>
                </circle>
            </svg>
        </div>
        <div class="ls-name">Municipal Planning &amp; Development Office</div>
        <div class="ls-status" aria-hidden="true"><div class="ls-bar"></div><span>Preparing your workspace</span></div>
    </div>
    <script>
        (function () {
            var el = document.getElementById('launch-splash');
            var root = document.documentElement;
            var start = Date.now();
            var MIN = matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : 3800;
            var done = false;
            function leave() {
                if (done) return;
                done = true;
                var wait = Math.max(0, MIN - (Date.now() - start));
                setTimeout(hand, wait);
            }
            function cleanup() {
                root.classList.remove('splash-flying', 'splash-on');
                el.remove();
            }
            // Fade everything out, and fly the logo into the navbar logo it becomes.
            function hand() {
                var mark = el.querySelector('.ls-mark');
                var nav = document.querySelector('img[data-splash-target]');
                var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
                root.classList.remove('splash-on'); // lets the page's own entrance animations start under the fading splash
                if (!nav || !mark || !mark.animate || reduce) {
                    el.style.transition = 'opacity .45s ease';
                    el.style.opacity = '0';
                    setTimeout(cleanup, 500);
                    return;
                }
                // The navbar image uses object-fit: contain, so work out where the logo itself sits inside it.
                var box = nav.getBoundingClientRect();
                var ratio = 887 / 1165;
                var th = box.width / box.height > ratio ? box.height : box.width / ratio;
                var m = mark.getBoundingClientRect();
                var dx = box.left + box.width / 2 - (m.left + m.width / 2);
                var dy = box.top + box.height / 2 - (m.top + m.height / 2);
                var scale = th / m.height;
                if (nav.getAttribute('data-splash-target') === 'symbol') {
                    // Target is the fingerprint-only mark (no lettering): align the two logos by their shared coordinates
                    // (fingerprint pin at 716,767; splash viewBox starts at 212,69; symbol viewBox is 1024 square).
                    var k1 = m.width / 887;
                    var side = Math.min(box.width, box.height);
                    var k2 = side / 1024;
                    var ox = box.left + (box.width - side) / 2;
                    var oy = box.top + (box.height - side) / 2;
                    var cx = m.left + m.width / 2;
                    var cy = m.top + m.height / 2;
                    scale = k2 / k1;
                    dx = ox + 716 * k2 - (cx + scale * (m.left + (716 - 212) * k1 - cx));
                    dy = oy + 767 * k2 - (cy + scale * (m.top + (767 - 69) * k1 - cy));
                    var fin = el.querySelector('.ls-final');
                    fin.src = '{{ asset('branding/imaps-symbol.svg') }}';
                    fin.style.cssText = 'inset:auto;max-width:none;max-height:none;object-fit:fill;left:' + (-212 * k1) + 'px;top:' + (-69 * k1) + 'px;width:' + (1024 * k1) + 'px;height:' + (1024 * k1) + 'px';
                    el.classList.add('no-lettering');
                }
                el.classList.toggle('keep-white', nav.getAttribute('data-splash-target') === 'white');
                nav.setAttribute('data-nav-logo', '');
                root.classList.add('splash-flying');
                el.classList.add('is-leaving');
                var fly = mark.animate(
                    [{ transform: 'none' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')' }],
                    { duration: 1700, delay: 100, easing: 'cubic-bezier(.5,0,.1,1)', fill: 'forwards' }
                );
                fly.onfinish = cleanup;
                setTimeout(cleanup, 2600); // safety net
            }
            window.addEventListener('imaps:ready', leave);
            setTimeout(leave, 10000); // never trap the user behind the splash
        })();
    </script>
    @endif
    @inertia
</body>
</html>
