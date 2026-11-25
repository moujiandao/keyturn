/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@supabase/ssr'],
  outputFileTracingIncludes: {
    '/api/learnings/[slug]': ['./docs/learnings/**'],
  },
};

export default nextConfig;
