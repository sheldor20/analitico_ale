import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContactEmails, normalizeWhatsapp } from "../lib/contact-utils.mjs";

test("normalizes, deduplicates and preserves multiple responsible emails", () => {
  assert.deepEqual(
    normalizeContactEmails([" Gestor@Sicoob.com.br ", "time@sicoob.com.br", "gestor@sicoob.com.br", ""]),
    ["gestor@sicoob.com.br", "time@sicoob.com.br"],
  );
});

test("rejects invalid responsible email and more than ten entries", () => {
  assert.throws(() => normalizeContactEmails(["sem-arroba"]), /E-mail inválido/);
  assert.throws(() => normalizeContactEmails(Array.from({ length: 11 }, (_, index) => `p${index}@sicoob.com.br`)), /no máximo 10/);
});

test("keeps whatsapp optional and trimmed", () => {
  assert.equal(normalizeWhatsapp("  +55 71 99999-9999  "), "+55 71 99999-9999");
  assert.equal(normalizeWhatsapp(""), "");
});
