'use strict';

/**
 * PLC data reader using nodes7.
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

let NodeS7;
try {
  NodeS7 = require('nodes7');
} catch (e) {
  NodeS7 = null;
}

// nodes7 addresses for the fixed dashboard tags
const DASHBOARD_TAGS = {
  triggerOffset:      'MW12',
  enableVision:       'M14.0',
  actualBatchCodeOCR: 'MD16',
  currentBatch:       'MD20',
  mesBatch:           'MD100',
  goodReads:          'DB1,DINT406',
  badReads:           'DB1,DINT410',
  totalBags:          'DB1,DINT414',
  lastReadGood:       'DB1,X418.0',
  lastReadBad:        'DB1,X418.1',
};

// Signed integer conversion boundaries
const INT16_MAX    = 0x7FFF;
const UINT16_RANGE = 0x10000;
const INT32_MAX    = 0x7FFFFFFF;
const UINT32_RANGE = 0x100000000;

class PlcClient {
  constructor() {
    this._conn = NodeS7 ? new NodeS7({ silent: true }) : null;
    this._connected = false;
    this._connecting = false;
    this._settings = null;
    this._dashboardItemsAdded = false;
  }

  connect(settings) {
    return new Promise((resolve, reject) => {
      if (!this._conn) {
        return reject(new Error('nodes7 not available'));
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

      this._conn.initiateConnection(
        {
          port: 102,
          host: settings.plcIp,
          rack: parseInt(settings.plcRack, 10),
          slot: parseInt(settings.plcSlot, 10),
        },
        (err) => {
          this._connecting = false;
          if (typeof err !== 'undefined') {
            this._connected = false;
            return reject(new Error(`PLC connect failed: ${err}`));
          }
          this._connected = true;
          if (!this._dashboardItemsAdded) {
            this._conn.addItems(Object.values(DASHBOARD_TAGS));
            this._dashboardItemsAdded = true;
          }
          resolve();
        }
      );
    });
  }

  disconnect() {
    if (this._conn && this._connected) {
      try {
        this._conn.dropConnection();
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
      if (!this._conn) {
        return reject(new Error('nodes7 not available'));
      }
      if (!this._connected) {
        return reject(new Error('PLC not connected'));
      }

      this._conn.readAllItems((anythingBad, values) => {
        if (anythingBad) {
          this._connected = false;
          return reject(new Error('readAllItems failed'));
        }
        try {
          resolve({
            triggerOffset:      this._toInt16(values[DASHBOARD_TAGS.triggerOffset]),
            enableVision:       !!values[DASHBOARD_TAGS.enableVision],
            actualBatchCodeOCR: this._toInt32(values[DASHBOARD_TAGS.actualBatchCodeOCR]),
            currentBatch:       this._toInt32(values[DASHBOARD_TAGS.currentBatch]),
            mesBatch:           this._toInt32(values[DASHBOARD_TAGS.mesBatch]),
            goodReads:          values[DASHBOARD_TAGS.goodReads],
            badReads:           values[DASHBOARD_TAGS.badReads],
            totalBags:          values[DASHBOARD_TAGS.totalBags],
            lastReadGood:       !!values[DASHBOARD_TAGS.lastReadGood],
            lastReadBad:        !!values[DASHBOARD_TAGS.lastReadBad],
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Write the System Enable bit (M14.0).
   */
  writeSystemEnable(value) {
    return new Promise((resolve, reject) => {
      if (!this._conn) return reject(new Error('nodes7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));
      this._conn.writeItems('M14.0', value ? 1 : 0, (anythingBad) => {
        if (anythingBad) return reject(new Error('Write M14.0 failed'));
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
      if (!this._conn) return reject(new Error('nodes7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));
      this._conn.writeItems('MW12', this._fromInt16(value), (anythingBad) => {
        if (anythingBad) return reject(new Error('Write MW12 failed'));
        resolve();
      });
    });
  }

  /**
   * Write the MES Batch value (MD100, DInt).
   */
  writeMesBatch(value) {
    return new Promise((resolve, reject) => {
      if (!this._conn) return reject(new Error('nodes7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));
      this._conn.writeItems('MD100', this._fromInt32(value), (anythingBad) => {
        if (anythingBad) return reject(new Error('Write MD100 failed'));
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
      if (!this._conn) return reject(new Error('nodes7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));

      const address = this._buildAddress(tag);
      if (!address) return reject(new Error(`Unknown dataType: ${tag.dataType}`));

      this._conn.addItems(address);
      this._conn.readAllItems((anythingBad, values) => {
        if (anythingBad) {
          this._conn.removeItems(address);
          return reject(new Error(`Read tag "${tag.name}" failed`));
        }
        const raw = values[address];
        this._conn.removeItems(address);
        if (raw === undefined || raw === null) {
          return reject(new Error(`No value returned for address ${address}`));
        }
        resolve(this._decodeValue(raw, tag.dataType, tag.area));
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
      if (!this._conn) return reject(new Error('nodes7 not available'));
      if (!this._connected) return reject(new Error('PLC not connected'));

      const address = this._buildAddress(tag);
      if (!address) return reject(new Error(`Unknown dataType: ${tag.dataType}`));

      const encoded = this._encodeValue(value, tag.dataType, tag.area);
      this._conn.writeItems(address, encoded, (anythingBad) => {
        if (anythingBad) return reject(new Error(`Write tag "${tag.name}" failed`));
        resolve();
      });
    });
  }

  /**
   * Build a nodes7 address string from a tag definition.
   * M area: M{b}.{bit} | MB{b} | MW{b} | MD{b} | MR{b}
   * DB area: DB{n},X{b}.{bit} | DB{n},BYTE{b} | DB{n},WORD{b} | DB{n},INT{b} | DB{n},DWORD{b} | DB{n},DINT{b} | DB{n},REAL{b}
   */
  _buildAddress(tag) {
    const { area, dbNumber, byteOffset, bitOffset, dataType } = tag;
    if (area === 'MK') {
      switch (dataType) {
        case 'Bool':  return `M${byteOffset}.${bitOffset || 0}`;
        case 'Byte':  return `MB${byteOffset}`;
        case 'Word':
        case 'Int':   return `MW${byteOffset}`;
        case 'DWord':
        case 'DInt':  return `MD${byteOffset}`;
        case 'Real':  return `MR${byteOffset}`;
        default: return null;
      }
    } else if (area === 'DB') {
      const db = dbNumber || 0;
      switch (dataType) {
        case 'Bool':  return `DB${db},X${byteOffset}.${bitOffset || 0}`;
        case 'Byte':  return `DB${db},BYTE${byteOffset}`;
        case 'Word':  return `DB${db},WORD${byteOffset}`;
        case 'Int':   return `DB${db},INT${byteOffset}`;
        case 'DWord': return `DB${db},DWORD${byteOffset}`;
        case 'DInt':  return `DB${db},DINT${byteOffset}`;
        case 'Real':  return `DB${db},REAL${byteOffset}`;
        default: return null;
      }
    }
    return null;
  }

  /**
   * Decode a raw nodes7 value to the correct JS type.
   * M area Int/DInt come back as unsigned from nodes7; DB area types are decoded natively.
   */
  _decodeValue(raw, dataType, area) {
    if (area === 'MK') {
      switch (dataType) {
        case 'Bool':  return !!raw;
        case 'Int':   return this._toInt16(raw);
        case 'DInt':  return this._toInt32(raw);
        default: return raw;
      }
    }
    // DB area – nodes7 handles sign/type natively
    if (dataType === 'Bool') return !!raw;
    return raw;
  }

  /**
   * Encode a JS value for writing via nodes7.
   * M area Int/DInt must be sent as their unsigned bit-pattern.
   */
  _encodeValue(value, dataType, area) {
    if (area === 'MK') {
      switch (dataType) {
        case 'Bool':  return value ? 1 : 0;
        case 'Int':   return this._fromInt16(Number(value));
        case 'DInt':  return this._fromInt32(Number(value));
        default: return Number(value);
      }
    }
    // DB area
    if (dataType === 'Bool') return value ? 1 : 0;
    return Number(value);
  }

  _toInt16(val) {
    const n = Number(val);
    return n > INT16_MAX ? n - UINT16_RANGE : n;
  }

  _toInt32(val) {
    const n = Number(val);
    return n > INT32_MAX ? n - UINT32_RANGE : n;
  }

  _fromInt16(val) {
    return val < 0 ? val + UINT16_RANGE : val;
  }

  _fromInt32(val) {
    return val < 0 ? val + UINT32_RANGE : val;
  }
}

module.exports = new PlcClient();
