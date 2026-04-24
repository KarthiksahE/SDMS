(function () {
    function normalizeApiUrl(rawUrl) {
        if (!rawUrl) return '';
        const trimmed = rawUrl.trim().replace(/\/$/, '');
        if (!trimmed) return '';
        return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
    }

    function resolveApiUrl() {
        const fromWindow = normalizeApiUrl(window.__SDMS_API_URL || '');
        if (fromWindow) return fromWindow;

        const fromMeta = normalizeApiUrl(
            document.querySelector('meta[name="sdms-api-url"]')?.content || ''
        );
        if (fromMeta) return fromMeta;

        const fromStorage = normalizeApiUrl(localStorage.getItem('sdms_api_url') || '');
        if (fromStorage) return fromStorage;

        const isLocalhost =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            return 'http://localhost:5000/api';
        }

        return `${window.location.origin}/api`;
    }

    window.SDMS_CONFIG = {
        API_URL: resolveApiUrl()
    };
})();
