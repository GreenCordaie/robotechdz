/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
                ]
            },
            {
                // Service worker MUST never be cached — browsers + intermediaries must always
                // revalidate. Otherwise an old SW keeps intercepting /_next/ chunks and the
                // user is stuck on a stale bundle for hours.
                source: '/sw.js',
                headers: [
                    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate, max-age=0' },
                    { key: 'Service-Worker-Allowed', value: '/' }
                ]
            }
        ];
    },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'res.cloudinary.com' },
            { protocol: 'https', hostname: '*.supabase.co' },
            { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
            { protocol: 'https', hostname: '*.r2.dev' },
        ],
    },
    output: 'standalone',
    eslint: {
        // ESLint cleanup planifié EPIC 11 — laissé désactivé pour ne pas bloquer
        // sur des warnings pré-existants. À flipper après nettoyage progressif.
        ignoreDuringBuilds: true,
    },
    typescript: {
        // EPIC 0 : 0 erreurs TS atteintes — le build crashe désormais sur toute
        // régression de typage. Ne PAS remettre à `true` sans corriger d'abord.
        ignoreBuildErrors: false,
    },
    experimental: {
        instrumentationHook: true,
    },
};

export default nextConfig;
