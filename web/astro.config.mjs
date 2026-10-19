// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { inlineHashes } from './src/inline-scripts.mjs';

// The site is built to static HTML here and served by the Spring Boot app in ../server.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://seanward.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  integrations: [mdx(), sitemap()],
  // Prism marks code with classes, which a strict CSP allows; Shiki's inline styles it would block.
  markdown: { syntaxHighlight: 'prism' },
  // Links are fetched when they come into view or are hovered; Chromium prerenders them through speculation rules.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  experimental: { clientPrerender: true },
  security: {
    // Hashes for every script and style Astro emits; no inline code runs without one.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://*.mzstatic.com https://i.scdn.co",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src https://embed.avlory.com https://challenges.cloudflare.com",
        "worker-src 'self'",
        "manifest-src 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", "'wasm-unsafe-eval'", 'https://challenges.cloudflare.com', 'https://embed.avlory.com'],
        hashes: inlineHashes,
      },
    },
  },
  vite: { build: { assetsInlineLimit: 2048 } },
});
