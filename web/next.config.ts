import type { NextConfig } from 'next';

/**
 * A static export: the ASP.NET server owns the API and serves these files from
 * wwwroot, exactly as it served the previous SPA. Next never runs on a server
 * here — every page is client-rendered against /shifter/v1.
 */
const nextConfig: NextConfig = {
  output: 'export',
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
  ];
}

export default nextConfig;
