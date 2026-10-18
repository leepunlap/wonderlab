/*!
 * Controller connection for the Wonder Lab editor (2026-10-13). Reuses the L2/L3 protocol work: the
 * vendor CLI (ucmake_cli.js) and Firmata (firmata.js), both of which live beside this file so the
 * editor ships them same-origin. Nothing here re-flashes a board.
 *
 *   const c = await connect('UC-Mind300');   // asks the browser for a port, opens it, identifies
 *   c.type       the controller that answered ('UC-Mind100' | 'UC-Mind300')
 *   c.protocol   'firmata' | 'cli'
 *   c.info       what the board reported
 */
import { Firmata, UCMake_PORT_FILTERS, WebSerialTransport } from './ucmake/firmata.js';
import { CLI_BAUD, PROFILES, UCMakeCli } from './ucmake/ucmake_cli.js';

/** Close a session (or a bare transport) without throwing. */
export async function closeSession(s) {
  try {
    const t = s && (s.transport || s);
    if (s && s.board && typeof s.board.close === 'function' && s.board !== t) await s.board.close();
    else if (t && typeof t.close === 'function') await t.close();
  } catch (e) { /* a port that is already gone is not an error */ }
}

export const CONTROLLERS = [
  { id: 'UC-Mind100', label: 'UC-Mind100', note: 'ESP32 · Firmata @57600' },
  { id: 'UC-Mind300', label: 'UC-Mind300', note: 'AVR/Uno · 廠商指令 @115200' },
];

/* Vendor ids -> what the teacher sees. The same bridges UCMake_PORT_FILTERS offers. */
const VENDORS = { 0x1a86: 'CH340', 0x10c4: 'CP210x', 0x0403: 'FTDI', 0x2341: 'Arduino', 0x2a03: 'Arduino', 0x303a: 'Espressif' };

/** A short label for a port: what kind of bridge it is, and its product id. */
export function portLabel(port, i) {
  const info = (port && port.getInfo && port.getInfo()) || {};
  const v = VENDORS[info.usbVendorId] || (info.usbVendorId ? 'USB ' + info.usbVendorId.toString(16) : '序列埠');
  const pid = info.usbProductId ? ':' + info.usbProductId.toString(16) : '';
  return `${v}${pid}${i === 0 ? ' (最近使用)' : ''}`;
}

/**
 * Ports the browser has already granted this page. The Web Serial API cannot list ports that were
 * never granted - there is no enumeration - so the only way to see a new board is the chooser.
 */
export async function listPorts() {
  if (!navigator.serial) return [];
  try { return await navigator.serial.getPorts(); } catch (e) { return []; }
}

/** Open the browser's port chooser, filtered to the bridges a UC-Mind kit uses. */
export async function choosePort() {
  if (!navigator.serial) throw new Error('這個瀏覽器不支援 Web Serial（請用 Chrome 或 Edge）。');
  return navigator.serial.requestPort({ filters: UCMake_PORT_FILTERS });
}

/** The first granted port that looks like a UC-Mind bridge (used when nothing is selected). */
async function askPort() {
  const ports = await listPorts();
  return ports.find((p) => UCMake_PORT_FILTERS.some((f) => f.usbVendorId === p.getInfo?.().usbVendorId))
      || ports[0] || await choosePort();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** What the board actually sent, for the console report. */
function seen(transport, max = 48) {
  const b = (transport && transport.buffer) || [];
  const head = Array.prototype.slice.call(b, 0, max);
  return head.length ? head.map((x) => x.toString(16).padStart(2, '0')).join(' ') : '(nothing)';
}

/** A one-screen report a teacher can copy out of the console when a board will not answer. */
function report(port, baud, step, transport, fw) {
  const info = (port && port.getInfo && port.getInfo()) || {};
  const line = '[ucmake] ' + step + ' · port vendor=' + (info.usbVendorId ? '0x' + info.usbVendorId.toString(16) : '?') +
    ' product=' + (info.usbProductId ? '0x' + info.usbProductId.toString(16) : '?') +
    ' · baud=' + baud + (fw ? ' · firmware=' + fw : '') + ' · bytes received: ' + seen(transport);
  try { console.info(line); } catch (e) {}
  return line;
}

/** Firmata at 57600 — the UC-Mind100 firmware. The board may still be booting, so ask more than once. */
async function asFirmata(transport, tries = 3) {
  let last = '';
  for (let i = 0; i < tries; i += 1) {
    const f = new Firmata(transport, { timeout: 900 });
    try {
      const info = await f.identify();
      // Either report identifies the firmware: the version reply (0xF9) or the firmware name sysex
      // (0x79). The kit's own realtime build answers the latter even when 0xF9 goes unanswered.
      if (info && (Array.isArray(info.firmata) || info.firmware)) return { protocol: 'firmata', board: f, info };
      last = '沒有 Firmata 回應（0xF9 及 0x79 都沒回應）';
    } catch (e) { last = (e && e.message) || String(e); }
    await wait(400);
  }
  throw new Error('Firmata 無回應（' + last.slice(0, 40) + '）');
}

/** The vendor CLI at 115200 — the UC-Mind300 firmware. */
async function asCli(transport, type, tries = 3) {
  let last = '';
  for (let i = 0; i < tries; i += 1) {
    const cli = new UCMakeCli(transport, PROFILES[type] || PROFILES['UC-Mind300']);
    const reply = await cli.query(['A1', 1, 1, 1], 1500).catch((e) => { last = (e && e.message) || ''; return ''; });
    if (/^[-+]?\d/.test(reply)) return { protocol: 'cli', board: cli, info: { reply: reply.trim().slice(0, 40) } };
    last = reply ? ('收到 ' + JSON.stringify(reply.trim().slice(0, 24))) : (last || '沒有回應');
    await wait(400);
  }
  throw new Error('主控板無回應（' + last.slice(0, 40) + '）');
}

/** A port left open by an earlier attempt makes port.open() throw, so close it first. */
async function openPort(port, opts) {
  try { if (port.readable || port.writable) await port.close(); } catch (e) { /* already shut */ }
  return WebSerialTransport.open(port, opts);
}

/**
 * Connect to the chosen controller over Web Serial.
 * Tries the protocol that controller is expected to speak first, then the other one, because the
 * firmware on a board is not always the one its model implies (a re-flashed UC-Mind300 answers
 * Firmata, for instance). Must be called from a user gesture: the port chooser needs one.
 */
export async function connect(type, port, deps) {
  const chosen = PROFILES[type] ? type : 'UC-Mind100';
  const open = (deps && deps.open) || openPort;          // injectable: the tests drive a fake board
  const forced = deps && deps.baud ? Number(deps.baud) : 0;   // 自動 = 0 = the protocol's own rate
  const baudFor = (how) => forced || (how === 'firmata' ? 57600 : CLI_BAUD);
  const order = ['cli', 'firmata'];         // the realtime firmware is the CLI; Firmata is the fallback
  const transport = await open(port || await askPort(), {
    baudRate: forced || (order[0] === 'firmata' ? 57600 : CLI_BAUD),
    settle: 600,
  });
  const tried = [];
  report(port, forced || (order[0] === 'firmata' ? 57600 : CLI_BAUD), 'opened as ' + chosen, transport);
  for (const how of order) {
    const baud = baudFor(how);
    try {
      const r = how === 'firmata' ? await asFirmata(transport) : await asCli(transport, chosen);
      const fw = r.protocol === 'firmata'
        ? 'Firmata ' + ((r.info && r.info.firmata) || []).join('.') + (r.info && r.info.firmware ? ' ' + r.info.firmware : '') +
          ' · ' + ((r.info && r.info.pins) || 0) + ' pins'
        : 'CLI reply ' + ((r.info && r.info.reply) || '');
      report(port, baud, 'answered as ' + how, transport, fw);
      r.firmware = fw;
      return { type: chosen, transport, ...r };
    } catch (e) {
      const line = report(port, baud, how + ' failed', transport);
      tried.push((how === 'firmata' ? 'Firmata' : 'CLI') + '@' + baud + '：' +
        String((e && e.message) || e).slice(0, 34) + ' ' + line.split('bytes received: ')[1]);
      if (typeof transport.reopen === 'function') {
        const next = order[order.indexOf(how) + 1];
        if (!next) continue;
        // switch to the rate the NEXT attempt needs; if the switch fails, say so rather than
        // testing the next protocol at the wrong baud and blaming the board.
        try { await transport.reopen({ baudRate: baudFor(next), settle: 1200 }); }
        catch (re) { tried.push('（無法切換到 ' + baudFor(next) + ' baud：' + String((re && re.message) || re).slice(0, 30) + '）'); }
      }
    }
  }
  await closeSession({ transport });
  throw new Error(tried.join('；') || '連接失敗。');
}
