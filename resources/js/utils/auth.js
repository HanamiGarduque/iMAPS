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

    const forceRedirectToLogin = () => {
        window.location.href = '/login';
    };

    router.post('/logout', {}, {
        onError: forceRedirectToLogin,
        onSuccess: forceRedirectToLogin,
        onFinish: forceRedirectToLogin,
    });
};
