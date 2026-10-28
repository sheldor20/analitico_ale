import test from 'node:test';
import assert from 'node:assert/strict';
import { lockBodyScroll } from '../lib/body-scroll-lock.mjs';

test('replacing dialogs restores page scrolling regardless of cleanup order', () => {
  for (const order of [[0,1],[1,0]]) {
    const body = {style:{overflow:''}};
    const releases = [lockBodyScroll(body),lockBodyScroll(body)];
    releases[order[0]]();
    assert.equal(body.style.overflow,'hidden');
    releases[order[1]]();
    assert.equal(body.style.overflow,'');
  }
});
test('nested dialogs preserve existing overflow and ignore repeated cleanup', () => {
  const body = {style:{overflow:'auto'}};
  const parent = lockBodyScroll(body), child = lockBodyScroll(body);
  parent(); parent();
  assert.equal(body.style.overflow,'hidden');
  child(); child();
  assert.equal(body.style.overflow,'auto');
  const next = lockBodyScroll(body);
  next();
  assert.equal(body.style.overflow,'auto');
});
test('strict effect replay and independent documents do not leak locks', () => {
  const first={style:{overflow:''}}, second={style:{overflow:'scroll'}};
  const replay=lockBodyScroll(first); replay();
  const a=lockBodyScroll(first), b=lockBodyScroll(second);
  a();
  assert.equal(first.style.overflow,'');
  assert.equal(second.style.overflow,'hidden');
  b();
  assert.equal(second.style.overflow,'scroll');
  lockBodyScroll(null)();
});
