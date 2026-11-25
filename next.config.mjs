/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@supabase/ssr'],
  outputFileTracingIncludes: {
    '/api/learnings/*': ['./docs/learnings/**'],
  },
};

export default nextConfig;
