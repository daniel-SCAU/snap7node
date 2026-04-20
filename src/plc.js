'use strict';

/**
 * PLC data reader using node-snap7.
 *
 * Tag map:
 *  Merker area:
 *    triggerOffset    %MW12      Int    byte 12, 2 bytes
 *    enableVision     %M14.0     Bool   byte 14, bit 0
 *    actualBatchCodeOCR %MD16   DInt   byte 16, 4 bytes
 *    currentBatch     %MD20      DInt   byte 20, 4 bytes
 *    mesBatch         %MD100     DInt   byte 100, 4 bytes
 *
 *  DB1:
 *    goodReads        DInt   offset 406
 *    badReads         DInt   offset 410
 *    totalBags        DInt   offset 414
 *    lastReadGood     Bool   offset 418, bit 0
 *    lastReadBad      Bool   offset 418, bit 1
 */

let snap7;
try {
  snap7 = require('node-snap7');
} catch (e) {
  snap7 = null;
}

const AREA_MK = 0x83;
const AREA_DB = 0x84;
const WL_BYTE = 0x02;
const WL_BIT  = 0x01;

// Byte sizes and word-length for each data type
const TYPE_META = {
  Bool:  { wl: WL_BIT,  bytes: 1 },
  Byte:  { wl: WL_BYTE, bytes: 1 },
  Word:  { wl: WL_BYTE, bytes: 2 },
  Int:   { wl: WL_BYTE, bytes: 2 },
  DWord: { wl: WL_BYTE, bytes: 4 },
  DInt:  { wl: WL_BYTE, bytes: 4 },
  Real:  { wl: WL_BYTE, bytes: 4 },
};

class PlcClient {
  constructor() {
    this._client = snap7 ? new snap7.S7Client() : null;
    this._connected = false;
    this._connecting = false;
    this._settings = null;
  }

  connect(settings) {
    return new Promise((resolve, reject) => {
      if (!this._client) {
        return reject(new Error('node-snap7 not available'));
      }
      if (this._connecting) {
        return reject(new Error('Already connecting'));
      }

      // Disconnect first if settings changed
      if (
        this._settings &&
        (this._settings.plcIp !== settings.plcIp ||
          this._settings.plcRack !== settings.plcRack ||
          this._settings.plcSlot !== settings.plcSlot)
      ) {
        this.disconnect();
      }

      if (this._connected) {
        this._settings = settings;
        return resolve();
      }

      this._connecting = true;
      this._settings = settings;

      this._client.ConnectTo(
        settings.plcIp,
        parseInt(settings.plcRack, 10),
        parseInt(settings.plcSlot, 10),
        (err) => {
          this._connecting = false;
          if (err) {
            this._connected = false;
            return reject(new Error(`PLC connect failed: ${this._client.ErrorText(err)}`));
          }
          this._connected = true;
          resolve();
        }
      );
    });
  }

  disconnect() {
    if (this._client && this._connected) {
      try {
        this._client.Disconnect();
      } catch (_) {}
      this._connected = false;
    }
  }

  get isConnected() {
    return this._connected;
  }

  /**
   * Read all dashboard tags.
   * Returns a promise resolving to the data object.
   */
  readAll() {
    return new Promise((resolve, reject) => {
      if (!this._client) {
        return reject(new Error('node-snap7 not available'));
      }
      if (!this._connected) {
        return reject(new Error('PLC not connected'));
      }

      // Build multi-read request
      const items = [
        // Merker area reads
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 12, Amount: 2 }, // triggerOffset  MW12 (2 bytes)
        { Area: AREA_MK, WordLen: WL_BIT,  DBNumber: 0, Start: 14 * 8 + 0, Amount: 1 }, // enableVision M14.0
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 16, Amount: 4 }, // actualBatchCodeOCR MD16
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 20, Amount: 4 }, // currentBatch MD20
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 100, Amount: 4 }, // mesBatch MD100
        // DB1 reads
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 406, Amount: 4 }, // goodReads
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 410, Amount: 4 }, // badReads
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 414, Amount: 4 }, // totalBags
        { Area: AREA_DB, WordLen: WL_BIT,  DBNumber: 1, Start: 418 * 8 + 0, Amount: 1 }, // lastReadGood
        { Area: AREA_DB, WordLen: WL_BIT,  DBNumber: 1, Start: 418 * 8 + 1, Amount: 1 }, // lastReadBad
      ];

      this._client.ReadMultiVars(items, (err, results) => {
        if (err) {
          this._connected = false;
          return reject(new Error(`ReadMultiVars failed: ${this._client.ErrorText(err)}`));
        }

        try {
          const data = this._parseResults(results);
          resolve(data);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  }

  /**
   * Write the System Enable bit (M14.0).
   */
  writeSystemEnable(value) {
    return new Promise((resolve, reject) => {
      if (!this._client) return reject(new Error('node-snap7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));
      const buf = Buffer.alloc(1);
      buf[0] = value ? 1 : 0;
      this._client.WriteArea(AREA_MK, 0, 14 * 8 + 0, 1, WL_BIT, buf, (err) => {
        if (err) return reject(new Error(`WriteArea M14.0 failed: ${this._client.ErrorText(err)}`));
        resolve();
      });
    });
  }

  /**
   * Write the Trigger Offset value (MW12, Int).
   * @param {number} value - The trigger offset in milliseconds (1-2000)
   * @returns {Promise<void>}
   */
  writeTriggerOffset(value) {
    return new Promise((resolve, reject) => {
      if (!this._client) return reject(new Error('node-snap7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));
      const buf = Buffer.alloc(2);
      buf.writeInt16BE(value, 0);
      this._client.WriteArea(AREA_MK, 0, 12, 2, WL_BYTE, buf, (err) => {
        if (err) return reject(new Error(`WriteArea MW12 failed: ${this._client.ErrorText(err)}`));
        resolve();
      });
    });
  }

  /**
   * Write the MES Batch value (MD100, DInt).
   */
  writeMesBatch(value) {
    return new Promise((resolve, reject) => {
      if (!this._client) return reject(new Error('node-snap7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(value, 0);
      this._client.WriteArea(AREA_MK, 0, 100, 4, WL_BYTE, buf, (err) => {
        if (err) return reject(new Error(`WriteArea MD100 failed: ${this._client.ErrorText(err)}`));
        resolve();
      });
    });
  }

  /**
   * Read a single user-defined tag from the PLC.
   * @param {object} tag - tag definition (area, dbNumber, byteOffset, bitOffset, dataType)
   * @returns {Promise<number|boolean>}
   */
  readTag(tag) {
    return new Promise((resolve, reject) => {
      if (!this._client) return reject(new Error('node-snap7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));

      const meta = TYPE_META[tag.dataType];
      if (!meta) return reject(new Error(`Unknown dataType: ${tag.dataType}`));

      const area     = tag.area === 'DB' ? AREA_DB : AREA_MK;
      const dbNumber = tag.area === 'DB' ? (tag.dbNumber || 0) : 0;
      const start    = meta.wl === WL_BIT
        ? tag.byteOffset * 8 + (tag.bitOffset || 0)
        : tag.byteOffset;
      const amount   = meta.wl === WL_BIT ? 1 : meta.bytes;

      this._client.ReadArea(area, dbNumber, start, amount, meta.wl, (err, buf) => {
        if (err) return reject(new Error(`ReadArea failed: ${this._client.ErrorText(err)}`));
        try {
          resolve(this._decodeBuffer(buf, tag.dataType));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Write a value to a single user-defined tag on the PLC.
   * @param {object} tag   - tag definition
   * @param {*}      value - value to write
   * @returns {Promise<void>}
   */
  writeTag(tag, value) {
    return new Promise((resolve, reject) => {
      if (!this._client) return reject(new Error('node-snap7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));

      const meta = TYPE_META[tag.dataType];
      if (!meta) return reject(new Error(`Unknown dataType: ${tag.dataType}`));

      let buf;
      try {
        buf = this._encodeBuffer(value, tag.dataType);
      } catch (e) {
        return reject(e);
      }

      const area     = tag.area === 'DB' ? AREA_DB : AREA_MK;
      const dbNumber = tag.area === 'DB' ? (tag.dbNumber || 0) : 0;
      const start    = meta.wl === WL_BIT
        ? tag.byteOffset * 8 + (tag.bitOffset || 0)
        : tag.byteOffset;
      const amount   = meta.wl === WL_BIT ? 1 : meta.bytes;

      this._client.WriteArea(area, dbNumber, start, amount, meta.wl, buf, (err) => {
        if (err) return reject(new Error(`WriteArea failed: ${this._client.ErrorText(err)}`));
        resolve();
      });
    });
  }

  _decodeBuffer(buf, dataType) {
    switch (dataType) {
      case 'Bool':  return buf[0] !== 0;
      case 'Byte':  return buf.readUInt8(0);
      case 'Word':  return buf.readUInt16BE(0);
      case 'Int':   return buf.readInt16BE(0);
      case 'DWord': return buf.readUInt32BE(0);
      case 'DInt':  return buf.readInt32BE(0);
      case 'Real':  return buf.readFloatBE(0);
      default: throw new Error(`Unknown dataType: ${dataType}`);
    }
  }

  _encodeBuffer(value, dataType) {
    switch (dataType) {
      case 'Bool': {
        const buf = Buffer.alloc(1);
        buf[0] = value ? 1 : 0;
        return buf;
      }
      case 'Byte': {
        const buf = Buffer.alloc(1);
        buf.writeUInt8(Math.trunc(Number(value)), 0);
        return buf;
      }
      case 'Word': {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(Math.trunc(Number(value)) & 0xffff, 0);
        return buf;
      }
      case 'Int': {
        const buf = Buffer.alloc(2);
        buf.writeInt16BE(Math.trunc(Number(value)), 0);
        return buf;
      }
      case 'DWord': {
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(Math.trunc(Number(value)) >>> 0, 0);
        return buf;
      }
      case 'DInt': {
        const buf = Buffer.alloc(4);
        buf.writeInt32BE(Math.trunc(Number(value)), 0);
        return buf;
      }
      case 'Real': {
        const buf = Buffer.alloc(4);
        buf.writeFloatBE(Number(value), 0);
        return buf;
      }
      default: throw new Error(`Unknown dataType: ${dataType}`);
    }
  }

  _parseResults(results) {
    const check = (r, idx) => {
      if (!r || r.Result !== 0) {
        throw new Error(`ReadMultiVars item ${idx} failed with code ${r ? r.Result : 'null'}`);
      }
      return r.Data;
    };

    const triggerOffsetBuf = check(results[0], 0);
    const enableVisionBuf  = check(results[1], 1);
    const actualBatchBuf   = check(results[2], 2);
    const currentBatchBuf  = check(results[3], 3);
    const mesBatchBuf      = check(results[4], 4);
    const goodReadsBuf     = check(results[5], 5);
    const badReadsBuf      = check(results[6], 6);
    const totalBagsBuf     = check(results[7], 7);
    const lastReadGoodBuf  = check(results[8], 8);
    const lastReadBadBuf   = check(results[9], 9);

    return {
      triggerOffset:      triggerOffsetBuf.readInt16BE(0),
      enableVision:       enableVisionBuf[0] !== 0,
      actualBatchCodeOCR: actualBatchBuf.readInt32BE(0),
      currentBatch:       currentBatchBuf.readInt32BE(0),
      mesBatch:           mesBatchBuf.readInt32BE(0),
      goodReads:          goodReadsBuf.readInt32BE(0),
      badReads:           badReadsBuf.readInt32BE(0),
      totalBags:          totalBagsBuf.readInt32BE(0),
      lastReadGood:       lastReadGoodBuf[0] !== 0,
      lastReadBad:        lastReadBadBuf[0] !== 0,
    };
  }
}

module.exports = new PlcClient();
