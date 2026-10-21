/*!
 * Wonder Lab — the UC-Make blocks, GENERATED. Do not edit by hand.
 *
 * Source of truth: spec/arduinoUno.json, which is the vendor's own getInfo() RUN (see
 * spec/extract_spec.mjs), not a transcription of it. Regenerate with tools/gen_ucmake_blocks.py.
 *
 * 19 blocks are emitted, out of 45 in the vendor's UC-Mind300 spec. The rest are
 * dropped ON PURPOSE: they have no serial command in arduinoUno.js, so the block would drag,
 * render, and silently do nothing, and a teacher would build a lesson on it. The interface
 * manual records the same gap (timers, 4-digit display, controller buttons:
 * 「积木存在生成器，但相应板的 VM 方法缺失」).
 *
 * Registered as an internal extension rather than with Blockly directly, because Blockly
 * alone only makes a block APPEAR. An extension also gives it a primitive, so it runs, and
 * serialises, so it survives a save.
 *
 * Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 */
(function (root) {
  'use strict';

  var CATEGORIES = [
    {
      id: "Buzzer",
      name: "Buzzer",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "setBuzzer",
          text: "play tone on note %1beat%2",
          blockType: "command",
          arguments: {"PIN": {"type": "string", "menu": "buzzerPins", "defaultValue": "3136"}, "LEVEL": {"type": "string", "menu": "buzzerLevel", "defaultValue": "250"}},
          wire: {"method": "buzzer", "order": ["PIN", "LEVEL"]}
        },
      ],
      menus: {"buzzerPins": {"acceptReporters": false, "items": [{"text": "B0", "value": "31"}, {"text": "C1", "value": "33"}, {"text": "D1", "value": "37"}, {"text": "E1", "value": "41"}, {"text": "F1", "value": "44"}, {"text": "G1", "value": "49"}, {"text": "A1", "value": "55"}, {"text": "B1", "value": "62"}, {"text": "C2", "value": "65"}, {"text": "D2", "value": "73"}, {"text": "E2", "value": "82"}, {"text": "F2", "value": "87"}, {"text": "G2", "value": "98"}, {"text": "A2", "value": "110"}, {"text": "B2", "value": "123"}, {"text": "C3", "value": "131"}, {"text": "D3", "value": "147"}, {"text": "E3", "value": "165"}, {"text": "F3", "value": "175"}, {"text": "G3", "value": "196"}, {"text": "A3", "value": "220"}, {"text": "B3", "value": "247"}, {"text": "C4", "value": "262"}, {"text": "D4", "value": "294"}, {"text": "E4", "value": "330"}, {"text": "F4", "value": "349"}, {"text": "G4", "value": "392"}, {"text": "A4", "value": "440"}, {"text": "B4", "value": "494"}, {"text": "C5", "value": "523"}, {"text": "D5", "value": "587"}, {"text": "E5", "value": "659"}, {"text": "F5", "value": "698"}, {"text": "G5", "value": "784"}, {"text": "A5", "value": "880"}, {"text": "B5", "value": "988"}, {"text": "C6", "value": "1047"}, {"text": "D6", "value": "1175"}, {"text": "E6", "value": "1319"}, {"text": "F6", "value": "1397"}, {"text": "G6", "value": "1568"}, {"text": "A6", "value": "1760"}, {"text": "B6", "value": "1976"}, {"text": "C7", "value": "2093"}, {"text": "D7", "value": "2349"}, {"text": "E7", "value": "2637"}, {"text": "F7", "value": "2794"}, {"text": "G7", "value": "3136"}, {"text": "A7", "value": "3520"}, {"text": "B7", "value": "3951"}, {"text": "C8", "value": "4186"}, {"text": "D8", "value": "4699"}]}, "buzzerLevel": {"acceptReporters": false, "items": [{"text": "Half", "value": "500"}, {"text": "Quarter", "value": "250"}, {"text": "Eighth", "value": "125"}, {"text": "Whole", "value": "1000"}, {"text": "Double", "value": "2000"}]}}
    },
    {
      id: "LEDS",
      name: "LED",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "setSingleLedOutput",
          text: "single led %1 %2",
          blockType: "command",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "LEVEL": {"type": "string", "menu": "level", "defaultValue": "HIGH"}},
          wire: {"method": "singleLed", "order": ["PIN", "LEVEL"]}
        },
      ],
      menus: {"level": {"acceptReporters": false, "items": [{"text": "high", "value": "HIGH"}, {"text": "low", "value": "LOW"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "BLEOnOff",
      name: "Bluetooth Transmission",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "setBLEOnOff",
          text: "Signal Transmission %1 %2",
          blockType: "command",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "LEVEL": {"type": "string", "menu": "level", "defaultValue": "HIGH"}},
          wire: {"method": "ble", "order": ["PIN", "LEVEL"]}
        },
      ],
      menus: {"level": {"acceptReporters": false, "items": [{"text": "high", "value": "HIGH"}, {"text": "low", "value": "LOW"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "compassSensor",
      name: "compassSensor",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readCompassSensor",
          text: "compass sensor %1 %2",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "AXIS": {"type": "number", "menu": "axis", "defaultValue": "x"}},
          wire: {"method": "readCompass", "order": ["AXIS", "PIN"]}
        },
      ],
      menus: {"axis": {"acceptReporters": false, "items": [{"text": "X-Axis", "value": "x"}, {"text": "Y-Axis", "value": "y"}, {"text": "Z-Axis", "value": "z"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "gyroSensor",
      name: "Gyroscope",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "readGyroSensor",
          text: "gyro sensor %1 %2 %3",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "INDEX": {"type": "number", "menu": "menuGyroSensor", "defaultValue": "1"}, "AXIS": {"type": "number", "menu": "axis", "defaultValue": "x"}},
          wire: {"method": "readGyro", "order": ["INDEX", "AXIS", "PIN"]}
        },
      ],
      menus: {"menuGyroSensor": {"acceptReporters": false, "items": [{"text": "Gyration", "value": "1"}, {"text": "Acceleration", "value": "2"}, {"text": "arduinoUno.menuGyroSensor.palstance", "value": "3"}]}, "axis": {"acceptReporters": false, "items": [{"text": "X-Axis", "value": "x"}, {"text": "Y-Axis", "value": "y"}, {"text": "Z-Axis", "value": "z"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "gestureSensor",
      name: "Gesture sensor",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readGestureSensorDigitalV2",
          text: "gesture recognition sensor V2.0 %1 detects gesture %2",
          blockType: "Boolean",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "LEVEL": {"type": "number", "menu": "gestureDirV2", "defaultValue": "3"}},
          wire: {"method": "readGesture", "order": ["LEVEL", "PIN"]}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}, "gestureDirV1": {"acceptReporters": false, "items": [{"text": "Forward", "value": "2"}, {"text": "Backward", "value": "4"}, {"text": "Left", "value": "3"}, {"text": "Right", "value": "1"}, {"text": "Down", "value": "5"}]}, "gestureDirV2": {"acceptReporters": false, "items": [{"text": "Forward", "value": "3"}, {"text": "Backward", "value": "4"}, {"text": "Left", "value": "2"}, {"text": "Right", "value": "1"}, {"text": "Up", "value": "6"}, {"text": "Down", "value": "5"}, {"text": "Clockwise", "value": "7"}, {"text": "Counterclockwise", "value": "8"}, {"text": "Shake", "value": "9"}]}, "gesturePos": {"acceptReporters": false, "items": [{"text": "centerX", "value": "1"}, {"text": "centerY", "value": "2"}, {"text": "size", "value": "3"}]}}
    },
    {
      id: "humiditySensor",
      name: "humidity",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readHumiditySensor",
          text: "humiture %1 %2",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "LEVEL": {"type": "number", "menu": "humidity", "defaultValue": "1"}},
          wire: {"method": "readHumiture", "order": ["LEVEL", "PIN"]}
        },
      ],
      menus: {"humidity": {"acceptReporters": false, "items": [{"text": "humidity", "value": "1"}, {"text": "tempperature", "value": "2"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "joystickSensor",
      name: "joystick",
      colour: "#5CB1D6",
      blocks: [
        {
          opcode: "readJoystickSensor",
          text: "joystick %1 %2",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "AXIS": {"type": "number", "menu": "axis2d", "defaultValue": "1"}},
          wire: {"method": "readJoystick", "order": ["AXIS", "PIN"]}
        },
      ],
      menus: {"axis2d": {"acceptReporters": false, "items": [{"text": "X-Axis", "value": "1"}, {"text": "Y-Axis", "value": "2"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "irReceivedSensor",
      name: "IR",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readIRReceived",
          text: "IR Received %1",
          blockType: "Boolean",
          arguments: {"INDEX": {"type": "number", "menu": "irrecvIndex", "defaultValue": "69"}},
          wire: {"method": "readIrReceived", "order": ["INDEX"]}
        },
      ],
      menus: {"irrecvIndex": {"acceptReporters": false, "items": [{"text": "A", "value": "69"}, {"text": "B", "value": "70"}, {"text": "C", "value": "71"}, {"text": "D", "value": "68"}, {"text": "E", "value": "67"}, {"text": "F", "value": "13"}, {"text": "↑", "value": "64"}, {"text": "↓", "value": "25"}, {"text": "←", "value": "7"}, {"text": "→", "value": "9"}, {"text": "OK", "value": "21"}, {"text": "R0", "value": "22"}, {"text": "R1", "value": "12"}, {"text": "R2", "value": "24"}, {"text": "R3", "value": "94"}, {"text": "R4", "value": "8"}, {"text": "R5", "value": "28"}, {"text": "R6", "value": "90"}, {"text": "R7", "value": "66"}, {"text": "R8", "value": "82"}, {"text": "R9", "value": "74"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "PIRReceivedSensor",
      name: "PIR",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readPIRReceived",
          text: "PIR %1 Received ",
          blockType: "Boolean",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}},
          wire: {"method": "readPir", "order": ["PIN"]}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "TouchReceivedSensor",
      name: "Touch",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readTouchReceived",
          text: "Touch %1 Received ",
          blockType: "Boolean",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}},
          wire: {"method": "readTouch", "order": ["PIN"]}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "lightSensor",
      name: "Light sensor",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readLightSensor",
          text: "Light Sensor",
          blockType: "reporter",
          arguments: {},
          wire: {"method": "readLight", "order": []}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "soundSensor",
      name: "sound sensor",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readSoundSensor",
          text: "Sound Sensor",
          blockType: "reporter",
          arguments: {},
          wire: {"method": "readSound", "order": []}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "rainDropSensor",
      name: "Rain Drop Sensor",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readRainDropSensor",
          text: "rainDrop %1",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}},
          wire: {"method": "readRainDrop", "order": ["PIN"]}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "moisTureSensor",
      name: "Soil Sensor",
      colour: "#ba1aff",
      blocks: [
        {
          opcode: "readMoisTureSensor",
          text: "moisture %1",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}},
          wire: {"method": "readMoisture", "order": ["PIN"]}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "ledButtonSensor",
      name: "Led button",
      colour: "#5CB1D6",
      blocks: [
        {
          opcode: "readLedButtonSensorDigital",
          text: "LED button %1 %2pressed?",
          blockType: "Boolean",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "LEVEL": {"type": "number", "menu": "ledButtonIndex", "defaultValue": "1"}},
          wire: {"method": "readLedButton", "order": ["PIN", "LEVEL"]}
        },
      ],
      menus: {"ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}, "ledButtonIndex": {"acceptReporters": false, "items": [{"text": "1", "value": "1"}, {"text": "2", "value": "2"}, {"text": "3", "value": "3"}, {"text": "4", "value": "4"}]}, "level": {"acceptReporters": false, "items": [{"text": "high", "value": "HIGH"}, {"text": "low", "value": "LOW"}]}}
    },
    {
      id: "lineFollower",
      name: "line follower",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "readLineFollower",
          text: "line follower %1 %2",
          blockType: "command",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "AXIS": {"type": "number", "menu": "lineType", "defaultValue": "2"}},
          wire: {"method": "readLineFollower", "order": ["PIN", "AXIS"]}
        },
      ],
      menus: {"lineType": {"acceptReporters": false, "items": [{"text": "arduinoUno.lineFollower.2LineFollower", "value": "2"}, {"text": "arduinoUno.lineFollower.5LineFollower", "value": "5"}]}, "axis2": {"acceptReporters": false, "items": [{"text": "S1", "value": "1"}, {"text": "S2", "value": "2"}]}, "axis5": {"acceptReporters": false, "items": [{"text": "S1", "value": "1"}, {"text": "S2", "value": "2"}, {"text": "S3", "value": "3"}, {"text": "S4", "value": "4"}, {"text": "S5", "value": "5"}]}, "level": {"acceptReporters": false, "items": [{"text": "high", "value": "HIGH"}, {"text": "low", "value": "LOW"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}}
    },
    {
      id: "colourSensor",
      name: "colour",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "readColorSensor",
          text: "color sensor  %1 %2",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}, "INDEX": {"type": "number", "menu": "colorIndex", "defaultValue": "1"}},
          wire: {"method": "readColor", "order": ["PIN", "INDEX"]}
        },
      ],
      menus: {"level": {"acceptReporters": false, "items": [{"text": "high", "value": "HIGH"}, {"text": "low", "value": "LOW"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}, "colorIndex": {"acceptReporters": false, "items": [{"text": "light", "value": "1"}, {"text": "red", "value": "2"}, {"text": "green", "value": "3"}, {"text": "blue", "value": "4"}]}}
    },
    {
      id: "ultrasonicSensor",
      name: "ultrasonic",
      colour: "#4C97FF",
      blocks: [
        {
          opcode: "readUltrasonicDistanceCm",
          text: "ultrasonic %1",
          blockType: "reporter",
          arguments: {"PIN": {"type": "string", "menu": "ucMakePorts", "defaultValue": "A5"}},
          wire: {"method": "readUltrasonic", "order": ["PIN"]}
        },
      ],
      menus: {"level": {"acceptReporters": false, "items": [{"text": "high", "value": "HIGH"}, {"text": "low", "value": "LOW"}]}, "ucMakePorts": {"acceptReporters": false, "items": [{"text": "PortA", "value": "A5"}, {"text": "PortB", "value": "A4"}, {"text": "PortC", "value": "A2"}, {"text": "PortD", "value": "A1"}]}, "ultrasonicLed": {"acceptReporters": false, "items": [{"text": "Both", "value": "3"}, {"text": "Left", "value": "2"}, {"text": "Right", "value": "1"}]}}
    },
  ];

  /**
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
