import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailFile, normalizeRecipients, whatsappNumber } from '../lib/portfolio-communication.mjs';
test('long Unicode subjects use valid short MIME encoded words without splitting code points', () => {
  const subject = 'Análise de carteira e atuação – '.repeat(8).trim();
  const eml = buildEmailFile({ subject, recipients: ['a@example.com', 'b@example.com'], text: 'Olá', html: '<p>Olá</p>' });
  const header = eml.split('Subject: ')[1].split('\r\nMIME-Version:')[0];
  const words = [...header.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
  assert.ok(words.length > 1);
  assert.ok(words.every((word) => word[0].length <= 75));
  assert.equal(words.map((word) => Buffer.from(word[1], 'base64').toString('utf8')).join(''), subject);
  assert.match(eml, /To: a@example.com,\r\n b@example.com/);
});
test('recipient limit counts unique nonempty validated emails rather than empty form rows', () => {
  const emails = Array.from({ length: 100 }, (_, i) => `p${i}@example.com`);
  assert.equal(normalizeRecipients([...emails, '', emails[0].toUpperCase()]).length, 100);
  assert.throws(() => normalizeRecipients([...emails, 'extra@example.com']), /100/);
  assert.throws(() => whatsappNumber('999999999'), /DDD/);
});
