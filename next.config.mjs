/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
