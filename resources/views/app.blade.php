<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Loop 6: no cached CSRF meta tag. CSRF relies on the Laravel XSRF
         cookie plus Axios' standard XSRF behavior. Re-adding a cached meta
         token reintroduces the stale-token 419 failure. -->
    <!-- Updated icon link -->
    <link rel="icon" type="image/png" href="{{ asset('favicon.png') }}">

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
    @inertiaHead
</head>
<body>
    @inertia
</body>
</html>
