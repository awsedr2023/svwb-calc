import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';

export function pwa(): Plugin {
  let out: string;
  let building = false;
  return {
    name: 'svwb-offline',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/licenses.md') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            '# Development preview\n\n本番の完全な一覧は npm run build 後の dist/licenses.md を確認してください。\n\n' +
              readFileSync(
                new URL('../node_modules/preact/LICENSE', import.meta.url),
                'utf8',
              ) +
              '\n\n' +
              readFileSync(
                new URL('../node_modules/vite/LICENSE.md', import.meta.url),
                'utf8',
              ).split('# Licenses of bundled dependencies')[0],
          );
          return;
        }
        if (req.url?.split('?')[0] !== '/LICENSE.txt') return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(new URL('../LICENSE', import.meta.url)));
      });
    },
    configResolved(config) {
      building = config.command === 'build';
      out = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!building) return;
      // Vite's collector skips virtual/generated modules, including its
      // modulepreload polyfill. Append the installed Vite core license only;
      // its build-time dependencies are not shipped to the browser.
      const notices = resolve(out, 'licenses.md');
      const viteLicense = readFileSync(
        new URL('../node_modules/vite/LICENSE.md', import.meta.url),
        'utf8',
      );
      const coreLicense = viteLicense
        .split('# Licenses of bundled dependencies')[0]
        .trim();
      if (
        !coreLicense.includes('Copyright') ||
        !coreLicense.includes('Permission is hereby granted')
      ) {
        throw new Error(
          'Vite core license format changed; review third-party notices',
        );
      }
      writeFileSync(
        notices,
        readFileSync(notices, 'utf8') +
          '\n\n## Vite-generated runtime (modulepreload polyfill)\n\n' +
          coreLicense +
          '\n',
      );
      writeFileSync(
        resolve(out, 'LICENSE.txt'),
        readFileSync(new URL('../LICENSE', import.meta.url)),
      );
      const files = readdirSync(out, { recursive: true })
        .map(String)
        .filter(
          (f) =>
            /\.(html|js|css|svg|png|webmanifest|txt|md)$/.test(f) &&
            f !== 'sw.js',
        )
        .sort();
      const hash = createHash('sha256');
      for (const f of files)
        hash.update(f).update(readFileSync(resolve(out, f)));
      const version = hash.digest('hex').slice(0, 16);
      const template = readFileSync(
        new URL('./sw-template.js', import.meta.url),
        'utf8',
      );
      writeFileSync(
        resolve(out, 'sw.js'),
        template
          .replace('__VERSION__', version)
          .replace(
            '__FILES__',
            JSON.stringify(
              files.map((f) =>
                relative(out, resolve(out, f)).replaceAll('\\', '/'),
              ),
            ),
          ),
      );
    },
  };
}
