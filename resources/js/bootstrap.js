import axios from 'axios';

window.axios = axios;

const csrfTokenMeta = document.head.querySelector('meta[name="csrf-token"]');
const csrfToken = csrfTokenMeta ? csrfTokenMeta.getAttribute('content') : null;

if (csrfToken) {
    window.axios.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken;
    window.axios.defaults.headers.common['X-XSRF-TOKEN'] = csrfToken;
}

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
