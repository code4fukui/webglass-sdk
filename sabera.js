/**
 * SABERA Web Bluetooth client.
 *
 * The packet format and UUIDs are based on:
 * https://github.com/taisukef/sabera-sdk/blob/main/docs/bluetooth-commands.md
 */

export const SABERA_UUIDS = Object.freeze({
  commandService: 'f48a23c0-f69a-11e8-8eb2-f2801f1b9fd1',
  commandWrite: 'f48a24c1-f69a-11e8-8eb2-f2801f1b9fd1',
  commandNotify: 'f48a25c2-f69a-11e8-8eb2-f2801f1b9fd1',
  audioService: 'e49a3001-f69a-11e8-8eb2-f2801f1b9fd1',
  audioNotify: 'e49a3003-f69a-11e8-8eb2-f2801f1b9fd1',
});

export const SABERA_GESTURES = Object.freeze({
  tap: 0x01,
  doubleTap: 0x02,
  longPress: 0x03,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function parseGesture(value) {
  const bytes = toBytes(value);
  if (bytes.length < 9 || bytes[1] !== 0x82) return null;
  let offset = 5;
  while (offset + 3 <= bytes.length) {
    const type = bytes[offset];
    const length = bytes[offset + 1] | (bytes[offset + 2] << 8);
    if (offset + 3 + length > bytes.length) return null;
    if (type === 0x01 && length >= 1) {
      const code = bytes[offset + 3];
      const name = Object.keys(SABERA_GESTURES).find((key) => SABERA_GESTURES[key] === code);
      return name ? { name, code } : null;
    }
    offset += 3 + length;
  }
  return null;
}

const toBytes = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('Value must be a Uint8Array or ArrayBuffer');
};

const le16 = (value) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);

/** Create one inner TLV. Length is a little-endian uint16. */
export function tlv(type, value) {
  const bytes = toBytes(value);
  if (bytes.length > 0xffff) throw new RangeError('TLV value is too large');
  return new Uint8Array([type, ...le16(bytes.length), ...bytes]);
}

/** Create a standard SABERA packet: 01, command, 80, payload length (LE), payload. */
export function packet(command, ...fields) {
  const payload = concat(fields.map((field) => field instanceof Uint8Array ? field : tlv(field.type, field.value)));
  if (payload.length > 0xffff) throw new RangeError('Packet payload is too large');
  return new Uint8Array([0x01, command, 0x80, ...le16(payload.length), ...payload]);
}

function concat(parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function uint16(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError('Expected uint16');
  return le16(value);
}

function uint8(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError('Expected uint8');
  return new Uint8Array([value]);
}

function text(value) {
  return encoder.encode(String(value));
}

function dateBytes(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new TypeError('Invalid date');
  // The protocol uses year, month, day, hour, minute, second, weekday.
  return new Uint8Array([
    ...uint16(d.getFullYear()), d.getMonth() + 1, d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay(),
  ]);
}

function be64(value) {
  let number = BigInt(value);
  if (number < 0n || number > 0xffffffffffffffffn) throw new RangeError('Expected uint64');
  const bytes = new Uint8Array(8);
  for (let index = 7; index >= 0; index--) {
    bytes[index] = Number(number & 0xffn);
    number >>= 8n;
  }
  return bytes;
}

function textPackets(command, type, value, maxBytes = 200) {
  const bytes = text(value);
  if (bytes.length <= maxBytes) return [packet(command, { type, value: concat([new Uint8Array([0x5a, 0x6b]), bytes]) })];
  const parts = [];
  for (let offset = 0; offset < bytes.length;) {
    const marker = offset === 0 ? [0x5a, 0x5a] : [0x7c, 0x7c];
    const isLast = offset + maxBytes >= bytes.length;
    const markerForPart = isLast ? (offset === 0 ? [0x5a, 0x6b] : [0x6b, 0x6b]) : marker;
    const room = maxBytes - 2;
    let end = Math.min(bytes.length, offset + room);
    // Never split a UTF-8 sequence. Continuation bytes are 10xxxxxx.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    if (end <= offset) throw new Error('Unable to split UTF-8 text');
    parts.push(packet(command, { type, value: concat([new Uint8Array(markerForPart), bytes.slice(offset, end)]) }));
    offset = end;
  }
  return parts;
}

export class SaberaClient extends EventTarget {
  constructor({ namePrefix = 'SABERA', characteristicOptions = {} } = {}) {
    super();
    this.namePrefix = namePrefix;
    this.characteristicOptions = characteristicOptions;
    this.device = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.audioCharacteristic = null;
    this._queue = Promise.resolve();
    this._onDisconnect = () => this._handleDisconnect();
    this._onNotification = (event) => {
      const value = event.target.value;
      this._emitData('data', value);
      const gesture = parseGesture(value);
      if (gesture) this._emitData('gesture', gesture);
    };
  }

  get connected() { return Boolean(this.device?.gatt?.connected && this.writeCharacteristic); }

  async connect() {
    if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth is not supported in this browser.');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: this.namePrefix }],
      optionalServices: [SABERA_UUIDS.commandService, SABERA_UUIDS.audioService],
      ...this.characteristicOptions,
    });
    this.device.addEventListener('gattserverdisconnected', this._onDisconnect);
    const server = await this.device.gatt.connect();
    const commandService = await server.getPrimaryService(SABERA_UUIDS.commandService);
    this.writeCharacteristic = await commandService.getCharacteristic(SABERA_UUIDS.commandWrite);
    try {
      this.notifyCharacteristic = await commandService.getCharacteristic(SABERA_UUIDS.commandNotify);
      await this.notifyCharacteristic.startNotifications();
      this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this._onNotification);
    } catch (error) {
      this._emitData('warning', error);
    }
    try {
      const audioService = await server.getPrimaryService(SABERA_UUIDS.audioService);
      this.audioCharacteristic = await audioService.getCharacteristic(SABERA_UUIDS.audioNotify);
    } catch { /* Audio is optional for the command sample. */ }
    this._emitData('connected', this.device);
    return this.device;
  }

  async disconnect() {
    if (this.notifyCharacteristic) {
      this.notifyCharacteristic.removeEventListener('characteristicvaluechanged', this._onNotification);
      try { await this.notifyCharacteristic.stopNotifications(); } catch { /* already disconnected */ }
    }
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this._handleDisconnect();
  }

  async sendCommand(bytes) {
    if (!this.connected) throw new Error('SABERA is not connected.');
    const data = toBytes(bytes);
    this._queue = this._queue.then(() => this.writeCharacteristic.writeValue(data));
    return this._queue;
  }

  async sendCommands(commands) {
    for (const command of commands) await this.sendCommand(command);
  }

  /** Register a callback for tap, doubleTap, and longPress gestures. */
  onGesture(callback) {
    if (typeof callback !== 'function') throw new TypeError('Gesture callback must be a function');
    const listener = (event) => callback(event.detail);
    this.addEventListener('gesture', listener);
    return () => this.removeEventListener('gesture', listener);
  }

  syncTime(date = new Date()) { return this.sendCommand(packet(0x01, { type: 0x01, value: dateBytes(date) })); }
  sendMessage({ appName = '', subject = '', body = '', date = new Date(), count = 1 } = {}) {
    const notificationDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(notificationDate.getTime())) throw new TypeError('Invalid notification date');
    return this.sendCommands([
      packet(0x03, { type: 0x01, value: text(appName) }, { type: 0x02, value: text(subject) }, { type: 0x03, value: be64(notificationDate.getTime()) }, { type: 0x04, value: text(body) }, { type: 0x05, value: uint16(count) }),
    ]);
  }
  syncNotificationCount(count) { return this.sendCommand(packet(0x03, { type: 0x05, value: uint16(count) })); }
  showScreen(screenId) { return this.sendCommand(packet(0x05, { type: 0x01, value: uint16(screenId) })); }
  // Send only the generic text command. Open screen 0x47 separately with
  // showScreen(0x47) when needed.
  sendText(value) { return this.sendCommands(textPackets(0x16, 0x01, value)); }
  clearText() { return this.sendCommand(packet(0x17)); }
  sendSetting(key, value) {
    const field = typeof value === 'boolean' ? { type: 0x03, value: new Uint8Array([value ? 1 : 0]) }
      : typeof value === 'number' ? { type: 0x02, value: uint16(value) }
      : { type: 0x04, value: text(value) };
    return this.sendCommand(packet(0x06, { type: 0x01, value: text(key) }, field));
  }

  _emitData(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _handleDisconnect() {
    if (this.device) this._emitData('disconnected', this.device);
    this.writeCharacteristic = this.notifyCharacteristic = this.audioCharacteristic = null;
  }
}

export function hex(bytes) { return [...toBytes(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join(' '); }
export function decodeText(bytes) { return decoder.decode(toBytes(bytes)); }
