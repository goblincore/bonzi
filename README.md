# bonzi

Rust tools for Microsoft Agent character files (.acs) and SAPI4 text-to-speech.

## Structure

- `acs/` - Rust library for parsing ACS files
- `acs-web/` - WASM bindings for browser
- `acs-web-example/` - Web viewer with TTS integration
- `sapi4-rs/` - Rust SAPI4 TTS binary (cross-compiled for Windows)
- `sapi4-api/` - Docker HTTP API for TTS
- `sapi4-tts/` - Docker container for running sapi4-rs

## Quick Start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (via rustup, with `wasm32-unknown-unknown` target)
- [bun](https://bun.sh/) or Node.js
- [Docker](https://docs.docker.com/get-docker/) (for SAPI4 TTS)

### 1. Build the WASM package

```bash
# Install wasm-pack if you don't have it
cargo install wasm-pack

# Add the WASM target (if using rustup)
rustup target add wasm32-unknown-unknown

# Build
cd acs-web
wasm-pack build --target web
```

### 2. Run the web viewer

```bash
cd acs-web-example
bun install
bun run dev
# Open http://localhost:5173
```

The viewer auto-discovers all `.acs` files in `public/agents/`. To add more characters, just drop `.acs` files into that folder and refresh.

### 3. Enable SAPI4 TTS (optional)

The viewer includes a built-in TTS panel that connects to the SAPI4 API for authentic Microsoft Agent voices (Sam, Sidney/Bonzi, etc.).

```bash
# Build and start the SAPI4 Docker container
cd sapi4-api
docker compose up -d --build

# Verify it's running
curl http://localhost:8085/health
# {"status": "ok"}

# List available voices
curl http://localhost:8085/voices
```

The viewer's TTS panel auto-connects via a Vite dev proxy (`/tts` -> `localhost:8085`). The status dot turns green when connected. Select a voice or check "Use [agent] voice" to use voice settings embedded in the ACS file (e.g., Bonzi.acs uses Sidney).

> **Note:** The SAPI4 container runs Wine under amd64 emulation on ARM Macs. First build takes a few minutes; subsequent builds use cached layers.

## Adding ACS Characters

Drop `.acs` files into `acs-web-example/public/agents/` and refresh the page. The dropdown auto-populates from the directory. You can also load files directly using the file picker in the UI.

## Usage (Library)

```typescript
import init, { AcsFile } from 'acs-web';

await init();

const response = await fetch('Bonzi.acs');
const data = new Uint8Array(await response.arrayBuffer());
const acs = new AcsFile(data);

console.log(acs.name, acs.width, acs.height);
console.log(acs.animationNames());
```

## ACS Format

ACS files contain animated characters with:
- Compressed sprite images (RLE + LZ77)
- Sound effects (WAV)
- Animation sequences with branching and transitions
- Character states for grouping related animations

See `notes/NOTES.md` for format documentation.

## Demo

https://acs-viewer.pages.dev
