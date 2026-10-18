/** Unit tests for the editor's controller connection. No hardware and no browser: `node --test`. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { connect, closeSession, portLabel } from './ucmake-connect.js';
import { MockTransport } from './ucmake/firmata.js';

/** A UC-Mind300: the vendor CLI, answers `A1 1 1 1` with a number. */
class CliBoard extends MockTransport {
  async write(bytes) {
    for (const b of bytes) this.written.push(b);
    const s = String.fromCharCode(...bytes);
    if (s.includes('A1 1 1 1')) for (const c of '123\n\r') this.pending.push(c.charCodeAt(0));
  }
  async read() { const o = Uint8Array.from(this.pending); this.pending.length = 0; return o; }
}

/** The kit's realtime build: answers the firmware sysex (0x79) but not the version request (0xF9). */
class MinimalBoard extends MockTransport {
  async write(bytes) {
    if (bytes.length === 1 && bytes[0] === 0xf9) { this.written.push(bytes[0]); return; }
    return super.write(bytes);
  }
}

/** A board that is powered but never answers. */
class DeadBoard extends MockTransport {
  async write(bytes) { for (const b of bytes) this.written.push(b); }
  async read() { return new Uint8Array(0); }
}

const openWith = (t) => async () => t;

test('a UC-Mind100 answering Firmata connects as firmata', async () => {
  const s = await connect('UC-Mind100', {}, { open: openWith(new MockTransport({ name: 'ucmind' })) });
  assert.equal(s.protocol, 'firmata');
  assert.equal(s.type, 'UC-Mind100');
});

test('a UC-Mind300 answering the vendor CLI connects as cli', async () => {
  const s = await connect('UC-Mind300', {}, { open: openWith(new CliBoard()) });
  assert.equal(s.protocol, 'cli');
  assert.equal(s.type, 'UC-Mind300');
});

test('choosing the wrong model still connects, and says which protocol answered', async () => {
  const a = await connect('UC-Mind300', {}, { open: openWith(new MockTransport({ name: 'x' })) });
  assert.equal(a.protocol, 'firmata', 'a Firmata board chosen as 300 must fall back to Firmata');
  const b = await connect('UC-Mind100', {}, { open: openWith(new CliBoard()) });
  assert.equal(b.protocol, 'cli', 'a CLI board chosen as 100 must fall back to the CLI');
});

test('a minimal firmware that ignores 0xF9 but answers 0x79 still connects', async () => {
  const s = await connect('UC-Mind100', {}, { open: openWith(new MinimalBoard({ name: 'ucmind' })) });
  assert.equal(s.protocol, 'firmata');
  assert.equal(s.info.firmata, null, 'no version report came back');
  assert.ok(s.info.firmware, 'but the firmware name did');
});

test('a board that never answers reports both attempts', async () => {
  await assert.rejects(() => connect('UC-Mind100', {}, { open: openWith(new DeadBoard()) }),
    (e) => /Firmata@57600/.test(e.message) && /CLI@115200/.test(e.message) && /無回應/.test(e.message),
    'the error must name what was tried');
});

test('closeSession closes the transport', async () => {
  let closed = false;
  const board = new MockTransport({ name: 'x' });
  board.close = async () => { closed = true; };
  const s = await connect('UC-Mind100', {}, { open: openWith(board) });
  await closeSession(s);
  assert.equal(closed, true);
});

test('closeSession tolerates nothing and a transport without close', async () => {
  await closeSession(null);
  await closeSession({ transport: {} });
});

test('portLabel names the bridge it knows and falls back politely', () => {
  const ch340 = { getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }) };
  assert.match(portLabel(ch340, 0), /CH340:7523/);
  assert.match(portLabel(ch340, 1), /CH340/);
  assert.match(portLabel({ getInfo: () => ({}) }, 0), /序列埠/);
});
