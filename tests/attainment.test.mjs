import test from 'node:test';
import assert from 'node:assert/strict';
import { attainmentBand } from '../lib/attainment.mjs';

test('observed attainment uses exact boundaries without rounding the ratio', () => {
  for (const value of [-2, -0.01, 0, 0.69, 0.699, 0.699999999999]) assert.equal(attainmentBand(value).key, 'red', `${value}`);
  for (const value of [0.7, 0.700000001, 0.999, 0.999999999999]) assert.equal(attainmentBand(value).key, 'yellow', `${value}`);
  for (const value of [1, 1.00000001, 2, 100]) assert.equal(attainmentBand(value).key, 'blue', `${value}`);
});

test('missing and invalid attainment is neutral rather than zero', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity, '0.7', '', false, {}, []]) {
    assert.equal(attainmentBand(value).key, 'neutral');
  }
});

test('attainment bands expose stable text and accessible foreground contrast', () => {
  const luminance = hex => {
    const linear = hex.match(/[0-9a-f]{2}/gi).map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  for (const value of [0, 0.7, 1, null]) {
    const band = attainmentBand(value);
    assert.ok(Object.isFrozen(band));
    assert.ok(band.label.length > 0);
    const contrast = (luminance(band.background) + 0.05) / (luminance(band.color) + 0.05);
    assert.ok(contrast >= 4.5, `${band.key}: ${contrast}`);
  }
});
