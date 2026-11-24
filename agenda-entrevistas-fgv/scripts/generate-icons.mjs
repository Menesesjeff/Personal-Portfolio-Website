// Gera os ícones PNG do PWA a partir dos SVGs em public/icons (usa Playwright/Chromium).
// Uso: npm run icons
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// `require` respeita NODE_PATH, permitindo usar um Playwright instalado globalmente.
const { chromium } = createRequire(import.meta.url)('playwright');

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
// [svg de origem, png de saída, largura, altura]
const alvos = [
  ['icon.svg', 'icon-192.png', 192, 192],
  ['icon.svg', 'icon-512.png', 512, 512],
  ['icon-maskable.svg', 'icon-maskable-192.png', 192, 192],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512, 512],
  ['icon-apple.svg', 'apple-touch-icon.png', 180, 180],
  ['logo-header.svg', 'logo-header.png', 528, 282], // 3× para telas retina
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [svg, png, w, h] of alvos) {
  const conteudo = readFileSync(join(dir, svg), 'utf8');
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${conteudo.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`,
  );
  await page.screenshot({ path: join(dir, png), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('✓', png);
}
await browser.close();
