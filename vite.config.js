import { loadChartCatalog } from './scripts/chart-datasets.mjs';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function chartDatasets() {
  const moduleId = '\0zetflix-chart-datasets';
  return {
    name: 'zetflix-chart-datasets',
    enforce: 'pre',
    resolveId: (source) => (source === '#chart-datasets' ? moduleId : undefined),
    load(id) {
      if (id !== moduleId) return undefined;
      const { catalog, files } = loadChartCatalog();
      for (const file of files) this.addWatchFile(file);
      this.addWatchFile(resolve('src/shared/data/sources.json'));
      return 'export const datasets = ' + JSON.stringify(catalog);
    },
    configureServer(server) {
      const update = (file) => {
        if (!/src[\\/]charts[\\/].*(chart\.json|query\.sql)$/.test(file)) return;
        const module = server.moduleGraph.getModuleById(moduleId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(resolve('src/charts'));
      server.watcher.on('add', update);
      server.watcher.on('unlink', update);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', update);
        server.watcher.off('unlink', update);
      });
    },
    handleHotUpdate(ctx) {
      if (/src[\\/]charts[\\/].*(chart\.json|query\.sql)$/.test(ctx.file)) {
        const module = ctx.server.moduleGraph.getModuleById(moduleId);
        if (module) ctx.server.moduleGraph.invalidateModule(module);
        ctx.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}
function parquetVersions() {
  const moduleId = '\0zetflix-parquet-versions';
  const root = resolve('public/data');
  return {
    name: 'zetflix-parquet-versions',
    resolveId: (source) => (source === 'virtual:parquet-versions' ? moduleId : undefined),
    load(id) {
      if (id !== moduleId) return undefined;
      const versions = {};
      for (const name of readdirSync(root).filter((file) => file.endsWith('.parquet'))) {
        const path = resolve(root, name);
        this.addWatchFile(path);
        versions[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
      }
      return 'export default ' + JSON.stringify(versions);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [chartDatasets(), parquetVersions()],
  resolve: {
    alias: [
      {
        find: /^@initial-workspace(?=\?|$)/,
        replacement: resolve(
          mode === 'test' ? 'tests/fixtures/workspace.json' : 'src/layout/workspace.json',
        ),
      },
    ],
  },
  server: { host: '127.0.0.1' },
  build: { target: 'es2022' },
}));
