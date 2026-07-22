/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // No proxy rewrites needed — frontend calls backend API directly via NEXT_PUBLIC_API_URL
};

module.exports = nextConfig;
