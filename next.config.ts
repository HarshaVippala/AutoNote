// next.config.ts
/** @type {import('next').NextConfig} */

const nextConfig = {
  // output: 'export', // <<< REMOVE OR COMMENT OUT THIS LINE
  images: {
    unoptimized: true, // Keep if needed, but maybe not relevant now
  },
  // Other configurations...
};

module.exports = nextConfig;