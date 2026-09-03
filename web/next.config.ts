import type { NextConfig } from 'next';

/**
 * A static export: the ASP.NET server owns the API and serves these files from
 * wwwroot, exactly as it served the previous SPA. Next never runs on a server
 * here — every page is client-rendered against /shifter/v1.
 */
/*
 * The day this was built.
 *
 * The roadmap footer carried «обновлено 27.08.2026» as a literal, which is a
 * page telling the reader how fresh it is out of a string nobody remembers to
 * change. It was a week stale the first time anybody looked. A static export
 * is built when it ships, so the build date is the honest answer and it keeps
 * itself.
 */
const BUILT_ON = new Date().toISOString().slice(0, 10);

const nextConfig: NextConfig = {
  output: 'export',
  env: { NEXT_PUBLIC_BUILT_ON: BUILT_ON },
  // dashboard.html rather than dashboard/index.html: the server rewrites
  // extensionless paths to `{path}.html`, which is one rule instead of a
  // directory convention spread over every route.
  trailingSlash: false,
  // The API computes everything; the client only displays it. Image
  // optimisation needs a server, which a static export does not have.
  images: { unoptimized: true },
};

// Dev only: proxy the API to the local backend, the same shape the old
// proxy.conf.json gave `ng serve`. Rewrites cannot ship in a static export,
// and never need to — in production the API is same-origin.
if (process.env.NODE_ENV === 'development') {
  nextConfig.rewrites = async () => [
    { source: '/shifter/:path*', destination: 'http://localhost:5208/shifter/:path*' },
    { source: '/health', destination: 'http://localhost:5208/health' },
    { source: '/feed/:path*', destination: 'http://localhost:5208/feed/:path*' },
  ];
}

export default nextConfig;
