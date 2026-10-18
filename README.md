# Wonder Lab Studio

Full Scratch editor integration for Wonder Lab.

Based on [Scratch](https://scratch.mit.edu/) by MIT Media Lab.

## License

AGPL-3.0-only

This is a derivative work of Scratch GUI (AGPL-3.0). See NOTICE for details.

## What's Included

- Scratch GUI fork
- Dual mode support (AI builds / Student builds)
- Teaching assistant interface
- Test server for local development
- Integration tests

## What's NOT Included

- AI teaching logic (imports from separate iits-repo)
- Lesson content (proprietary)
- Pedagogy guards (proprietary)

## Build

```bash
npm install
npm run build
# Output: dist/studio-<hash>/
```

## Test Server

```bash
# Prototype server (uses iits-repo pedagogy)
python3 server/studio_server.py --port 8920
```

**Note**: Requires `iits-repo` in parallel directory for pedagogy import.

## Production Deployment

Production uses:
- This repo for UI (Scratch GUI)
- Separate backend service for pedagogy (not in this repo)
- Nginx to serve static files

## Testing

```bash
cd test
python3 e2e.py              # End-to-end tests
python3 dual_e2e.py         # Dual mode tests
python3 module_matrix.py    # Module isolation
```

## Attribution

Based on Scratch, developed by the Lifelong Kindergarten Group at the MIT Media Lab. See https://scratch.mit.edu
