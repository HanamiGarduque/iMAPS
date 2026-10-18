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
    @inertiaHead
</head>
<body>
    @inertia
</body>
</html>
