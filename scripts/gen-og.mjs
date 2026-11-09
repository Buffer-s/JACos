/**
 * Generates public/og.png (1200×630) from an SVG using @resvg/resvg-js.
 * Run: node scripts/gen-og.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ff5500"/>
  <rect x="0" y="470" width="1200" height="160" fill="#e64d00" opacity="0.55"/>

  <!-- bars + cloud mark -->
  <g fill="#ffffff">
    <rect x="96" y="214" width="26" height="182" rx="13"/>
    <rect x="146" y="172" width="26" height="224" rx="13"/>
    <rect x="196" y="132" width="26" height="264" rx="13"/>
    <rect x="246" y="98" width="26" height="298" rx="13"/>
    <rect x="296" y="66" width="26" height="330" rx="13"/>
    <circle cx="415" cy="330" r="96"/>
    <circle cx="540" cy="270" r="130"/>
    <rect x="330" y="322" width="330" height="110" rx="55"/>
  </g>

  <text x="96" y="520" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="800" fill="#ffffff" letter-spacing="-2">JACo's Soundcloud</text>
  <text x="96" y="586" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="#ffe3d4" letter-spacing="0.5">Just Another Copy of Sweden's Soundcloud</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true },
});
writeFileSync('public/og.png', resvg.render().asPng());
console.log('wrote public/og.png');
