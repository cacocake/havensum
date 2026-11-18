import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { k_brandPaths, k_brandStrokeWidth, k_brandColors } from '../src/brandGeometry.js';

const k_assetDirectory = new URL('../assets/brand/', import.meta.url);
const k_publicDirectory = new URL('../public/', import.meta.url);
const k_paths = k_brandPaths.map(path => `<path d="${path}"/>`).join('');

function createVector(color, { background, adaptive = false } = {}) {
  const viewBoxSize = adaptive ? 108 : 64;
  const backgroundShape = background ? `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${background}"/>` : '';
  const transform = adaptive ? ' transform="translate(6 6) scale(1.5)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" role="img" aria-label="Havensum"><title>Havensum</title>${backgroundShape}<g${transform} fill="none" stroke="${color}" stroke-width="${k_brandStrokeWidth}" stroke-linecap="round" stroke-linejoin="round">${k_paths}</g></svg>\n`;
}

function createWordmark(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310 64" role="img" aria-label="Havensum"><title>Havensum</title><g fill="none" stroke="${color}" stroke-width="${k_brandStrokeWidth}" stroke-linecap="round" stroke-linejoin="round">${k_paths}</g><text x="66" y="46" fill="${color}" font-family="Fredoka, sans-serif" font-size="42" font-weight="450" letter-spacing="-1">havensum</text></svg>\n`;
}

await mkdir(k_assetDirectory, { recursive: true });
const vectors = {
  'mark-light.svg': createVector(k_brandColors.light),
  'mark-dark.svg': createVector(k_brandColors.dark),
  'mark-monochrome.svg': createVector('currentColor'),
  'wordmark-light.svg': createWordmark(k_brandColors.light),
  'wordmark-dark.svg': createWordmark(k_brandColors.dark),
  'wordmark-monochrome.svg': createWordmark('currentColor'),
  'icon.svg': createVector(k_brandColors.light, { background: k_brandColors.background }),
  'adaptive-foreground.svg': createVector(k_brandColors.light, { adaptive: true }),
  'adaptive-monochrome.svg': createVector('#000000', { adaptive: true }),
  'adaptive-background.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="#E48A60"/></svg>\n'
};
for (const [name, vector] of Object.entries(vectors)) {
  await writeFile(new URL(name, k_assetDirectory), vector);
}
await writeFile(new URL('favicon.svg', k_publicDirectory), vectors['icon.svg']);

// Chromium rasterizes the editable SVG source; no image generation or tracing.
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const rasterAssets = [
    ['icon.svg', 1024, 'icon.png', k_assetDirectory],
    ['icon.svg', 192, 'icon-192.png', k_publicDirectory],
    ['icon.svg', 512, 'icon-512.png', k_publicDirectory],
    ['icon.svg', 32, 'favicon-32.png', k_publicDirectory],
    ['adaptive-foreground.svg', 432, 'adaptive-foreground.png', k_assetDirectory],
    ['adaptive-background.svg', 432, 'adaptive-background.png', k_assetDirectory],
    ['adaptive-monochrome.svg', 432, 'adaptive-monochrome.png', k_assetDirectory]
  ];
  for (const [sourceName, size, outputName, directory] of rasterAssets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;}svg{display:block;width:100%;height:100%;}</style>${vectors[sourceName]}`);
    await page.screenshot({ path: fileURLToPath(new URL(outputName, directory)), omitBackground: true });
  }
} finally {
  await browser.close();
}
