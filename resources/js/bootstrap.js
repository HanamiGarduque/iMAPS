import axios from 'axios';

window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// Automatically handle expired CSRF token (419 Page Expired) for Axios requests
window.axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 419) {
            window.location.reload();
        }
        return Promise.reject(error);
    }
);

// Session heartbeat: Ping server every 10 minutes to keep Laravel session & CSRF token active
setInterval(() => {
    window.axios.get('/ping').catch(() => {});
}, 10 * 60 * 1000);
