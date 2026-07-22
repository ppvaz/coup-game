// Capturas de referência da mesa 3D: sobe o dev server, percorre a matriz
// shots × viewports × temas no /3d/lab (cena congelada) e salva PNGs em
// captures/. Usa o Chrome instalado via playwright-core, sem download.
//
//   npm run capture:3d                       — matriz completa
//   npm run capture:3d -- --themes=dark --viewports=portrait --shots=duel:0-3
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright-core';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};
const SHOTS = [
  'table',
  'player',
  'pov:3',
  'overhead',
  'portal',
  'duel:0-1',
  'duel:0-2',
  'duel:0-3',
  'duel:2',
  'evidence:1',
  'throne:3',
  'victory:3',
  'victory-reactions:3-0',
  'coins:steal',
  'decision:challenge',
  'decision:challenge-confirm',
  'decision:block',
  'decision:block-confirm',
];
const THEMES = ['dark', 'light'];

const listArg = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw
    ? raw
        .slice(name.length + 3)
        .split(',')
        .filter(Boolean)
    : fallback;
};

const waitForServer = async (url, attempts = 60) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // servidor ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Dev server não respondeu em ${url}`);
};

const themes = listArg('themes', THEMES);
const viewports = listArg('viewports', Object.keys(VIEWPORTS));
const shots = listArg('shots', SHOTS);

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await waitForServer(BASE);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const failures = [];
  for (const viewportName of viewports) {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewportName] });
    await context.addInitScript(() => localStorage.setItem('la-corte-3d-lab-access', 'granted'));
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`Browser: ${error.message}`));
    for (const theme of themes) {
      const directory = `captures/${theme}/${viewportName}`;
      await mkdir(directory, { recursive: true });
      for (const shot of shots) {
        const label = `${theme}/${viewportName}/${shot}`;
        try {
          await page.goto(`${BASE}/3d/lab?shot=${encodeURIComponent(shot)}&theme=${theme}`);
          await page.waitForSelector('.tabletop-loading.hidden', { timeout: 30_000 });
          await page.waitForTimeout(700);
          const path = `${directory}/${shot.replaceAll(':', '-')}.png`;
          await page.screenshot({ path });
          console.log(`✓ ${label} → ${path}`);
        } catch (error) {
          failures.push(label);
          console.error(`✖ ${label}: ${error.message.split('\n')[0]}`);
        }
      }
    }
    await context.close();
  }
  await browser.close();
  if (failures.length) {
    console.error(`\n${failures.length} captura(s) falharam.`);
    process.exitCode = 1;
  }
} finally {
  server.kill();
}
