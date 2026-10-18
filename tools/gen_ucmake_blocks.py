#!/usr/bin/env python3
"""Generate the WonderLab UC-Make extension from the vendor's own getInfo() spec.

Input:  spec/arduinoUno.json  (produced by spec/extract_spec.mjs — the vendor's getInfo(), run)
Output: src/ucmake-blocks.js  (a scratch-vm internal extension)

Why an extension and not just Blockly blocks: registering with Blockly alone makes a block
*appear* and nothing else. It has no VM primitive, so dragging it onto the stage produces a
block the sequencer cannot run, cannot serialise, and that vanishes on reload. An internal
extension gets all three: `_registerInternalExtension(instance)` calls `instance.getInfo()` and
registers the blocks, the toolbox category and one primitive per opcode.

Only opcodes with a serial command in the vendor's source are emitted, and each is wired to the
UCMakeCli method that sends that exact command. A block with nothing behind it is worse than no
block: a teacher builds a lesson on it and it silently does nothing.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent          # <studio>/tools
STUDIO = HERE.parent
ROOT = STUDIO.parent.parent                      # <tree> — the repos live at <tree>/src/<repo>
SPEC = ROOT / "src" / "iits-repo" / "lab-device" / "spec" / "arduinoUno.json"
OUT = STUDIO / "src" / "ucmake-blocks.js"

# opcode -> the UCMakeCli method that sends it, and the order its arguments are passed in.
# Every command template was read out of arduinoUno.js; the CLI method sends that same command.
WIRED = {
    "setBuzzer": ("buzzer", ["PIN", "LEVEL"]),
    "setSingleLedOutput": ("singleLed", ["PIN", "LEVEL"]),
    "setBLEOnOff": ("ble", ["PIN", "LEVEL"]),
    "readCompassSensor": ("readCompass", ["AXIS", "PIN"]),
    "readGyroSensor": ("readGyro", ["INDEX", "AXIS", "PIN"]),
    "readGestureSensorDigitalV2": ("readGesture", ["LEVEL", "PIN"]),
    "readHumiditySensor": ("readHumiture", ["LEVEL", "PIN"]),
    "readJoystickSensor": ("readJoystick", ["AXIS", "PIN"]),
    "readIRReceived": ("readIrReceived", ["INDEX"]),
    "readPIRReceived": ("readPir", ["PIN"]),
    "readTouchReceived": ("readTouch", ["PIN"]),
    "readLightSensor": ("readLight", []),
    "readSoundSensor": ("readSound", []),
    "readRainDropSensor": ("readRainDrop", ["PIN"]),
    "readMoisTureSensor": ("readMoisture", ["PIN"]),
    "readLedButtonSensorDigital": ("readLedButton", ["PIN", "LEVEL"]),
    "readLineFollower": ("readLineFollower", ["PIN", "AXIS"]),
    "readColorSensor": ("readColor", ["PIN", "INDEX"]),
    "readUltrasonicDistanceCm": ("readUltrasonic", ["PIN"]),
}


def js(v):
    return json.dumps(v, ensure_ascii=False)


def to_placeholders(text, args):
    """The vendor writes [PIN] and [LEVEL]; scratch-vm's `text` needs %1 and %2.

    A block whose text carries no %n but declares arguments cannot be built - the VM has nowhere to
    put the fields - and one unbuildable block takes the WHOLE toolbox with it. That is what made
    blocks appear on refresh and then vanish: every one of the 19 was in this state.
    """
    names = []
    out = []
    i = 0
    while i < len(text):
        if text[i] == "[":
            j = text.find("]", i)
            if j > i:
                name = text[i + 1:j].strip()
                if name in args:
                    names.append(name)
                    out.append("%" + str(len(names)))
                    i = j + 1
                    continue
        out.append(text[i])
        i += 1
    # any argument the vendor's wording did not mention still needs a slot
    for a in args:
        if a not in names:
            names.append(a)
            out.append(" %" + str(len(names)))
    return "".join(out), names


def main():
    if not SPEC.exists():
        raise SystemExit(f"missing {SPEC} — run spec/extract_spec.mjs first")
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    total = sum(len(c["blocks"]) for c in spec["categories"])

    cats, emitted = [], 0
    for cat in spec["categories"]:
        blocks = []
        for b in cat["blocks"]:
            if b["opcode"] not in WIRED:
                continue                      # no serial command behind it: not offered
            method, argorder = WIRED[b["opcode"]]
            args = {}
            for a in b["args"]:
                spec_arg = {"type": a["type"]}
                if a["menu"]:
                    spec_arg["menu"] = a["menu"]
                if a["default"] is not None:
                    spec_arg["defaultValue"] = a["default"]
                args[a["name"]] = spec_arg
            msg, order = to_placeholders(b["text"], args)
            blocks.append({
                "opcode": b["opcode"],
                "text": msg,
                "blockType": b["blockType"],
                "arguments": args,
                "wire": {"method": method, "order": argorder},
            })
            emitted += 1
        if blocks:
            cats.append({"id": cat["id"], "name": cat["name"],
                         "colour": cat["colour"] or "#0F766E", "blocks": blocks,
                         "menus": cat.get("menus") or {}})

    L = []
    A = L.append
    A("/*!")
    A(" * Wonder Lab — the UC-Make blocks, GENERATED. Do not edit by hand.")
    A(" *")
    A(" * Source of truth: spec/arduinoUno.json, which is the vendor's own getInfo() RUN (see")
    A(" * spec/extract_spec.mjs), not a transcription of it. Regenerate with tools/gen_ucmake_blocks.py.")
    A(" *")
    A(f" * {emitted} blocks are emitted, out of {total} in the vendor's UC-Mind300 spec. The rest are")
    A(" * dropped ON PURPOSE: they have no serial command in arduinoUno.js, so the block would drag,")
    A(" * render, and silently do nothing, and a teacher would build a lesson on it. The interface")
    A(" * manual records the same gap (timers, 4-digit display, controller buttons:")
    A(" * 「积木存在生成器，但相应板的 VM 方法缺失」).")
    A(" *")
    A(" * Registered as an internal extension rather than with Blockly directly, because Blockly")
    A(" * alone only makes a block APPEAR. An extension also gives it a primitive, so it runs, and")
    A(" * serialises, so it survives a save.")
    A(" *")
    A(" * Licensed under the GNU Affero General Public License v3.0 (see LICENSE).")
    A(" */")
    A("(function (root) {")
    A("  'use strict';")
    A("")
    A("  var CATEGORIES = [")
    for c in cats:
        A("    {")
        A(f"      id: {js(c['id'])},")
        A(f"      name: {js(c['name'])},")
        A(f"      colour: {js(c['colour'])},")
        A("      blocks: [")
        for b in c["blocks"]:
            A("        {")
            A(f"          opcode: {js(b['opcode'])},")
            A(f"          text: {js(b['text'])},")
            A(f"          blockType: {js(b['blockType'])},")
            A(f"          arguments: {json.dumps(b['arguments'], ensure_ascii=False)},")
            A(f"          wire: {json.dumps(b['wire'], ensure_ascii=False)}")
            A("        },")
        A("      ],")
        # scratch-vm reads menuInfo[name].acceptReporters, so a menu MUST be an object with
        # {acceptReporters, items} - a bare array makes that property undefined, the block fails
        # to build, and the ENTIRE palette comes back empty after a refresh. Blocks appeared, then
        # vanished; the video showed it plainly.
        wrapped = {k: {"acceptReporters": False, "items": v} for k, v in (c["menus"] or {}).items()}
        A(f"      menus: {json.dumps(wrapped, ensure_ascii=False)}")
        A("    },")
    A("  ];")
    A("")
    A("""  /**
   * The extension. `session` is the connected UCMakeCli, or null when no controller is attached —
   * in which case every primitive resolves without sending anything, so a student can build and
   * run a project on screen before plugging anything in.
   */
  function UCMakeExtension(runtime, session) {
    this.runtime = runtime;
    this.session = session || null;
  }

  UCMakeExtension.prototype.setSession = function (session) { this.session = session || null; };

  /** One primitive per opcode, built from the same wire table the blocks come from. */
  UCMakeExtension.prototype.getInfo = function () {
    var self = this;
    var blocks = [];
    var prims = {};
    CATEGORIES.forEach(function (cat) {
      cat.blocks.forEach(function (b) {
        blocks.push({
          opcode: b.opcode,
          blockType: b.blockType,
          text: b.text,
          arguments: b.arguments
        });
        prims[b.opcode] = function (args) {
          var s = self.session;
          var isCommand = String(b.blockType).toLowerCase() === 'command';
          if (!s) return isCommand ? undefined : 0;   // no board: build and run on screen
          var name = b.wire.method;
          if (typeof s[name] !== 'function') {
            // Loud, not silent. A missing method means the wire table and the CLI have drifted,
            // which is the one failure that is otherwise invisible at run time.
            throw new Error('UC-Make: ' + name + '() is not on the session');
          }
          var call = b.wire.order.map(function (k) { return args[k]; });
          return s[name].apply(s, call);
        };
      });
    });
    return {
      id: 'ucmake',
      name: 'UC-Make',
      color1: '#0F766E',
      color2: '#0B5A54',
      // customFieldTypes must EXIST even when empty. The gui tests
      //   if (!ArgumentTypeMap[arg.type] && categoryInfo.customFieldTypes[...])
      // and an undefined customFieldTypes makes that throw, so the argument is dropped, the block
      // is built with message0 full of %n and no args0, and scratch-blocks then refuses it with
      // "Message index %1 out of range" - which aborts the WHOLE toolbox parse and takes the
      // palette's flyout with it.
      customFieldTypes: {},
      color3: '#0B5A54',
      blocks: blocks,
      menus: CATEGORIES.reduce(function (m, c) {
        Object.keys(c.menus || {}).forEach(function (k) { m[k] = c.menus[k]; });
        return m;
      }, {}),
      _primitives: prims
    };
  };

  /**
   * Install the Blockly definitions ourselves.
   *
   * The gui converts an extension's blocks into Blockly definitions, but it does that only for
   * extensions it knows about when it builds its blocks - a built-in like pen. An extension
   * registered after mount gets its metadata into the VM and its category into the toolbox, and no
   * definition: the toolbox then names block types Blockly cannot build, one failure aborts the
   * whole toolbox parse, and the palette loses its flyout.
   *
   * Measured on this page: with the extension registered, EVERY variant of our block data produced
   *   json: { message0: "…%1…%2…" }     and no args0
   * - offset placeholders, bare {type} arguments, pen's own "color" type, and all combinations.
   * So the conversion is not happening at all, rather than happening badly.
   *
   * The definitions go into ScratchBlocks.Blocks, the registry the workspace itself consults. It is
   * not window.Blockly (a {Msg} stub); studio-core finds it through the React fiber that owns the
   * workspace.
   */
  UCMakeExtension.install = function (scratchBlocks) {
    if (!scratchBlocks || !scratchBlocks.Blocks) return 0;
    var n = 0;
    CATEGORIES.forEach(function (cat) {
      cat.blocks.forEach(function (b) {
        var type = 'ucmake_' + b.opcode;
        // Overwrite, do not skip. The gui registers a definition for our blocks too - but with
        // message0 and no args0, because its converter never maps our arguments - so skipping an
        // existing type would leave the broken one in place. Ours is the correct one.
        var names = Object.keys(b.arguments || {});
        // the gui prepends two slots for the extension icon and separator, so the block's own
        // arguments start at %3 - which is why every extension block's message reads "%1 %2…%3"
        var msg = b.text;
        var args0 = names.map(function (k, i) {
          var spec = b.arguments[k] || {};
          var slot = { type: 'input_value', name: k };
          var menus = cat.menus || {};
          var m = spec.menu && menus[spec.menu];
          if (m) {
            var items = m.items || m || [];
            return { type: 'field_dropdown', name: k,
                     options: items.map(function (it) {
                       return [String(it.text != null ? it.text : it), String(it.value != null ? it.value : it)];
                     }) };
          }
          return slot;
        });
        var isCommand = String(b.blockType).toLowerCase() === 'command';
        var isBool = String(b.blockType) === 'Boolean';
        var def = { type: type, message0: msg, args0: args0, colour: cat.colour || '#0F766E',
                    tooltip: b.text, helpUrl: '' };
        if (isCommand) { def.previousStatement = null; def.nextStatement = null; }
        else if (isBool) { def.output = 'Boolean'; }
        else { def.output = 'String'; }
        scratchBlocks.Blocks[type] = { init: function () { this.jsonInit(def); } };
        n += 1;
      });
    });
    return n;
  };

  /** Register with the VM and install the Blockly definitions. Returns blocks registered. */
  UCMakeExtension.register = function (vm, session, scratchBlocks) {
    if (!vm || !vm.runtime || !vm.extensionManager) return 0;
    var inst = new UCMakeExtension(vm.runtime, session);
    try {
      vm.extensionManager._registerInternalExtension(inst);
    } catch (e) {
      if (root.console && console.warn) {
        console.warn('[WonderLab] UC-Make register failed:', e && e.message);
      }
      return 0;
    }
    root.UCMakeInstance = inst;
    var defs = UCMakeExtension.install(scratchBlocks);
    if (root.console) console.info('[UC-Make] blocks:', inst.getInfo().blocks.length, '· Blockly definitions:', defs);
    return inst.getInfo().blocks.length;
  };

  root.UCMakeExtension = UCMakeExtension;
  root.UCMakeCategories = CATEGORIES;
}(typeof window !== 'undefined' ? window : this));
""")

    OUT.write_text("\n".join(L), encoding="utf-8")
    print(f"  {emitted} blocks wired across {len(cats)} categories")
    print(f"  dropped {total - emitted} with no serial command")
    print(f"  wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size} B")


if __name__ == "__main__":
    main()
