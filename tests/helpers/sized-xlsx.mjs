import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

// Keep workbook XML small: an ignored PNG ancillary chunk supplies the bytes.
// STORE makes the ZIP size deterministic and exercises large, valid input
// without raising the existing 64 MiB expansion limit or weakening ZIP checks.
export async function sizedXlsx(workbook, byteLength) {
  const imageId = workbook.addImage({ buffer: PIXEL, extension: 'png' });
  workbook.worksheets[0].addBackgroundImage(imageId);
  const options = { zip: { compression: 'STORE' } };
  const small = await workbook.xlsx.writeBuffer(options);
  const addedLength = byteLength - small.byteLength;
  assert.ok(addedLength >= 12, 'Requested size must leave room for a PNG chunk');

  const chunk = Buffer.alloc(addedLength);
  chunk.writeUInt32BE(addedLength - 12, 0);
  chunk.write('npAD', 4, 'ascii');
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), addedLength - 4);
  workbook.getImage(imageId).buffer = Buffer.concat([
    PIXEL.subarray(0, -12), chunk, PIXEL.subarray(-12),
  ]);
  const result = await workbook.xlsx.writeBuffer(options);
  assert.equal(result.byteLength, byteLength);
  return result;
}
