import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// Valid ACS files start with 0xC3ABCDAB. OLE Compound Documents (0xD0CF11E0)
// are a different container format that some .acs files use — skip those.
const ACS_MAGIC = Buffer.from([0xc3, 0xab, 0xcd, 0xab]);

function isValidAcsFile(filepath: string): boolean {
  try {
    const fd = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.equals(ACS_MAGIC);
  } catch {
    return false;
  }
}

// Vite plugin: serves GET /api/agents with list of .acs files in public/agents/
// So adding a new agent is just: drop .acs file into public/agents/ and refresh.
// Filters out non-ACS files (OLE containers, corrupted files, etc.) by checking magic bytes.
function agentListPlugin(): Plugin {
  return {
    name: 'agent-list',
    configureServer(server) {
      server.middlewares.use('/api/agents', (_req, res) => {
        const agentsDir = path.join(import.meta.dirname, 'public/agents');
        try {
          const files = fs.readdirSync(agentsDir)
            .filter(f => f.toLowerCase().endsWith('.acs'))
            .filter(f => isValidAcsFile(path.join(agentsDir, f)))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
        } catch {
          res.statusCode = 500;
          res.end('[]');
        }
      });
    },
    // For production builds: generate a static manifest
    writeBundle() {
      const agentsDir = path.join(import.meta.dirname, 'public/agents');
      const outDir = path.join(import.meta.dirname, 'dist/api');
      try {
        const files = fs.readdirSync(agentsDir)
          .filter(f => f.toLowerCase().endsWith('.acs'))
          .filter(f => isValidAcsFile(path.join(agentsDir, f)))
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'agents'), JSON.stringify(files));
      } catch {
        // noop
      }
    },
  };
}

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), agentListPlugin()],
  server: {
    fs: {
      // Allow serving files from the parent directory (for acs-web package)
      allow: ['..'],
    },
    proxy: {
      // Proxy /tts/* to sapi4-api to avoid CORS issues in dev
      '/tts': {
        target: 'http://localhost:8085',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tts/, ''),
      },
    },
  },
});
