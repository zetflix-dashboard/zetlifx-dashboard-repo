import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function publishedWorkspaceVersion() {
  return {
    name: 'zetflix-published-workspace-version',
    apply: 'build',
    generateBundle() {
      const content = readFileSync(resolve('src/layout/workspace.json'));
      const sha = createHash('sha1')
        .update('blob ' + content.length + String.fromCharCode(0))
        .update(content)
        .digest('hex');
      this.emitFile({
        type: 'asset',
        fileName: 'workspace-version.json',
        source: JSON.stringify({ sha }),
      });
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
      this.addWatchFile(root);
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
  plugins: [parquetVersions(), publishedWorkspaceVersion()],
  resolve: {
    alias: [
      {
        find: /^@published-workspace(?=\?|$)/,
        replacement: resolve(
          mode === 'test' ? 'tests/fixtures/workspace.json' : 'src/layout/workspace.json',
        ),
      },
    ],
  },
  server: { host: '127.0.0.1' },
  build: { target: 'es2022' },
}));
