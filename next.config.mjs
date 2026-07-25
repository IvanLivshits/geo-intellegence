/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: [
    'deck.gl',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/react',
  ],
  experimental: {
    outputFileTracingIncludes: {
      '/s/[id]/og': ['./assets/fonts/**'],
    },
  },
};

export default nextConfig;
