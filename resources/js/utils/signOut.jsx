import Swal from 'sweetalert2';
import { performLogout } from '@/utils/auth';

// The one sign-out confirmation used everywhere — the original Dashboard look.
// (Kept in a .jsx file so Tailwind scans these class names.)
export const confirmSignOut = () =>
    Swal.fire({
        title: 'Sign out?',
        text: 'Are you sure you want to log out of iMAPS?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sign out',
        cancelButtonText: 'Cancel',
        buttonsStyling: false,
        customClass: {
            popup: 'rounded-md border border-slate-200 shadow-xl p-6 bg-white',
            title: 'text-lg font-semibold text-slate-900',
            htmlContainer: 'text-xs text-slate-500',
            actions: 'flex items-center justify-center gap-3 mt-5',
            confirmButton: 'inline-flex items-center justify-center px-4 py-2 rounded-[3px] bg-[#0b2a5b] hover:bg-[#0e3574] text-white text-xs font-semibold cursor-pointer',
            cancelButton: 'inline-flex items-center justify-center px-4 py-2 rounded-[3px] bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 cursor-pointer',
        },
    }).then((result) => {
        if (result.isConfirmed) performLogout();
    });
