import { router } from '@inertiajs/react';

/**
 * Perform a reliable logout operation.
 * Ensures local storage/session storage are cleared and guarantees
 * redirection to /login even if network errors or CSRF 419 session timeouts occur.
 */
export const performLogout = () => {
    try {
        sessionStorage.removeItem("hasShownWelcome");
        sessionStorage.removeItem("imaps_verified_parcel_prefill");
        sessionStorage.clear();
    } catch (err) {
        console.warn("Storage clear error on logout:", err);
    }

    // On success the server redirects to /login and Inertia shows it. Forcing a second, full
    // reload here as well made the login page load twice. Only fall back to a hard redirect
    // when the logout request didn't succeed (network error, server error, expired session).
    let succeeded = false;

    router.post('/logout', {}, {
        onSuccess: () => {
            succeeded = true;
        },
        onFinish: () => {
            if (!succeeded) window.location.href = '/login';
        },
    });
};
