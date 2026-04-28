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
 *    beforeDateDInt   %MD42      DInt   byte 42, 4 bytes
 *    prodDateDInt     %MD46      DInt   byte 46, 4 bytes
 *    bagNoDInt        %MD50      DInt   byte 50, 4 bytes
 *    mesBatch         %MD100     DInt   byte 100, 4 bytes
 *
 *  DB1:
 *    goodReads              DInt   offset 406
 *    badReads               DInt   offset 410
 *    totalBags              DInt   offset 414
 *    lastReadGood           Bool   offset 418, bit 0
 *    lastReadBad            Bool   offset 418, bit 1
 *    LastGoodCountTotal     DInt   offset 456
 *    LastRejectCountTotal   DInt   offset 460
 *    DeltaGood              DInt   offset 464
 *    DeltaReject            DInt   offset 468
 *    InternalTimestamp_s    Real   offset 472
 *    LogTimer_s             Real   offset 476
 *    LogSequence            DInt   offset 480
 *    Availability           Real   offset 484
 *    Performance            Real   offset 488
 *    Quality                Real   offset 492
 *    OEE                    Real   offset 496
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
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 42,  Amount: 4 }, // beforeDateDInt MD42
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 46,  Amount: 4 }, // prodDateDInt MD46
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 50,  Amount: 4 }, // bagNoDInt MD50
        { Area: AREA_MK, WordLen: WL_BYTE, DBNumber: 0, Start: 100, Amount: 4 }, // mesBatch MD100
        // DB1 reads
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 406, Amount: 4 }, // goodReads
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 410, Amount: 4 }, // badReads
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 414, Amount: 4 }, // totalBags
        { Area: AREA_DB, WordLen: WL_BIT,  DBNumber: 1, Start: 418 * 8 + 0, Amount: 1 }, // lastReadGood
        { Area: AREA_DB, WordLen: WL_BIT,  DBNumber: 1, Start: 418 * 8 + 1, Amount: 1 }, // lastReadBad
        // DB1 batch string reads (S7 String: 2-byte header + char data)
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 0,   Amount: 9  }, // batchStr String[7]
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 428, Amount: 10 }, // LastBatchStartStr String[8]
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 438, Amount: 10 }, // LastBatchBestBeforeStr String[8]
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 448, Amount: 7  }, // lastBagNo String[5]
        // DB1 OEE data
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 456, Amount: 4 }, // LastGoodCountTotal
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 460, Amount: 4 }, // LastRejectCountTotal
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 464, Amount: 4 }, // DeltaGood
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 468, Amount: 4 }, // DeltaReject
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 472, Amount: 4 }, // InternalTimestamp_s
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 476, Amount: 4 }, // LogTimer_s
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 480, Amount: 4 }, // LogSequence
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 484, Amount: 4 }, // Availability
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 488, Amount: 4 }, // Performance
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 492, Amount: 4 }, // Quality
        { Area: AREA_DB, WordLen: WL_BYTE, DBNumber: 1, Start: 496, Amount: 4 }, // OEE
      ];

      // Split into chunks that fit within the PLC's PDU size. S7-300/400 PLCs
      // negotiate a 240-byte PDU by default; each read request occupies a 12-byte
      // header plus 12 bytes per item, leaving room for at most 19 items.  Use 18
      // to stay safely below the limit and avoid the "total data exceeds PDU" error.
      this._readMultiVarsChunked(items)
        .then((results) => {
          try {
            resolve(this._parseResults(results));
          } catch (parseErr) {
            reject(parseErr);
          }
        })
        .catch((err) => {
          this._connected = false;
          reject(err);
        });
    });
  }

  /**
   * Split items into chunks of at most MAX_VARS and call ReadMultiVars for each,
   * then concatenate all result arrays in order.
   *
   * MAX_VARS is capped at 18 to stay within the 240-byte PDU negotiated by
   * S7-300/400 PLCs (request = 12-byte header + N × 12 bytes per item;
   * 12 + 18 × 12 = 228 bytes, safely below the 240-byte limit).
   */
  _readMultiVarsChunked(items) {
    const MAX_VARS = 18;
    const chunks = [];
    for (let i = 0; i < items.length; i += MAX_VARS) {
      chunks.push(items.slice(i, i + MAX_VARS));
    }

    return chunks.reduce(
      (promise, chunk) =>
        promise.then((acc) =>
          new Promise((resolve, reject) => {
            this._client.ReadMultiVars(chunk, (err, results) => {
              if (err) {
                return reject(new Error(`ReadMultiVars failed: ${this._client.ErrorText(err)}`));
              }
              resolve(acc.concat(results));
            });
          })
        ),
      Promise.resolve([])
    );
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

  /**
   * Decode an S7 String buffer.
   * S7 String format: byte[0] = maxLength, byte[1] = actualLength, byte[2..] = ASCII chars.
   */
  _decodeS7String(buf) {
    if (!buf || buf.length < 2) return '';
    const actualLen = Math.min(buf[1], buf.length - 2);
    if (actualLen <= 0) return '';
    return buf.toString('ascii', 2, 2 + actualLen).replace(/[^\x20-\x7E]/g, '');
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
    const beforeDateBuf    = check(results[4], 4);
    const prodDateBuf      = check(results[5], 5);
    const bagNoBuf         = check(results[6], 6);
    const mesBatchBuf      = check(results[7], 7);
    const goodReadsBuf     = check(results[8], 8);
    const badReadsBuf      = check(results[9], 9);
    const totalBagsBuf     = check(results[10], 10);
    const lastReadGoodBuf  = check(results[11], 11);
    const lastReadBadBuf   = check(results[12], 12);
    const batchStrBuf             = check(results[13], 13);
    const lastBatchStartStrBuf    = check(results[14], 14);
    const lastBatchBBStrBuf       = check(results[15], 15);
    const lastBagNoBuf            = check(results[16], 16);
    const lastGoodCountTotalBuf   = check(results[17], 17);
    const lastRejectCountTotalBuf = check(results[18], 18);
    const deltaGoodBuf            = check(results[19], 19);
    const deltaRejectBuf          = check(results[20], 20);
    const internalTimestampBuf    = check(results[21], 21);
    const logTimerBuf             = check(results[22], 22);
    const logSequenceBuf          = check(results[23], 23);
    const availabilityBuf         = check(results[24], 24);
    const performanceBuf          = check(results[25], 25);
    const qualityBuf              = check(results[26], 26);
    const oeeBuf                  = check(results[27], 27);

    return {
      triggerOffset:      triggerOffsetBuf.readInt16BE(0),
      enableVision:       enableVisionBuf[0] !== 0,
      actualBatchCodeOCR: actualBatchBuf.readInt32BE(0),
      currentBatch:       currentBatchBuf.readInt32BE(0),
      beforeDateDInt:     beforeDateBuf.readInt32BE(0),
      prodDateDInt:       prodDateBuf.readInt32BE(0),
      bagNoDInt:          bagNoBuf.readInt32BE(0),
      mesBatch:           mesBatchBuf.readInt32BE(0),
      goodReads:          goodReadsBuf.readInt32BE(0),
      badReads:           badReadsBuf.readInt32BE(0),
      totalBags:          totalBagsBuf.readInt32BE(0),
      lastReadGood:       lastReadGoodBuf[0] !== 0,
      lastReadBad:        lastReadBadBuf[0] !== 0,
      batchStr:           this._decodeS7String(batchStrBuf),
      lastBatchStartStr:  this._decodeS7String(lastBatchStartStrBuf),
      lastBatchBBStr:     this._decodeS7String(lastBatchBBStrBuf),
      lastBagNo:          this._decodeS7String(lastBagNoBuf),
      lastGoodCountTotal:   lastGoodCountTotalBuf.readInt32BE(0),
      lastRejectCountTotal: lastRejectCountTotalBuf.readInt32BE(0),
      deltaGood:            deltaGoodBuf.readInt32BE(0),
      deltaReject:          deltaRejectBuf.readInt32BE(0),
      internalTimestamp_s:  internalTimestampBuf.readFloatBE(0),
      logTimer_s:           logTimerBuf.readFloatBE(0),
      logSequence:          logSequenceBuf.readInt32BE(0),
      availability:         availabilityBuf.readFloatBE(0),
      performance:          performanceBuf.readFloatBE(0),
      quality:              qualityBuf.readFloatBE(0),
      oee:                  oeeBuf.readFloatBE(0),
    };
  }
}

module.exports = new PlcClient();
