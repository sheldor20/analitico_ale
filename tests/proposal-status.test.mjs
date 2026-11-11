import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProposalProjection, parseProposalPaste, sumProposalAmounts, validateProposalDate } from '../lib/proposal-status.mjs';

const header = 'Cooperativa\tAceita\tCancelada\tEm Análise\tPendente\tRecusada';
const amounts = {
  1010: { accepted: 0, cancelled: 10000, inReview: 5401, pending: 1301, rejected: 28000 },
  1011: { accepted: 1225, cancelled: 30000, inReview: 3000, pending: 6000, rejected: 11000 },
};

test('proposal position parses Excel and Markdown, keeps centavos and reconciles the pivot total', () => {
  const tsv = `${header}\r\n001010\t\t100\t54,01\t13,01\t280\r\n1011\t12,25\t300\t30\t60\t110\r\n(vazio)\t\t\t\t\t\r\nTotal Geral\t12,25\t400\t84,01\t73,01\t390`;
  assert.deepEqual(parseProposalPaste(tsv), amounts);
  assert.deepEqual(sumProposalAmounts(amounts), { accepted: 1225, cancelled: 40000, inReview: 8401, pending: 7301, rejected: 39000 });

  const markdown = `| **Nº Coop** | Recusadas | Pendentes | Em   Análise | Canceladas |
| --- | --- | --- | --- | --- |
| 1010 | R$ 1.234,56&#x20; | 130 | 100,01 | — |
| **Total Geral** | **&#xA0;R$ 1.234,56** | 130,00 | 100,01 | 0 |`;
  assert.deepEqual(parseProposalPaste(markdown)['1010'], { accepted: 0, cancelled: 0, inReview: 10001, pending: 13000, rejected: 123456 });
  assert.throws(() => parseProposalPaste(tsv.replace('\t390', '\t391')), /Total Geral de recusadas/);
  assert.throws(() => parseProposalPaste(`${header}\n1010\t0\t50\t30\t10\t9\n001010\t0\t50\t30\t10\t9`), /mais de uma vez/);
  assert.throws(() => parseProposalPaste(`${header}\n(vazio)\t0\t50\t30\t10\t9`), /código de cooperativa/);
  assert.throws(() => parseProposalPaste(`${header}\n1010\t0\t50,555\t30\t10\t9`), /valor inválido/);
});

test('proposal forecasts require an annual observation for flows and use resolution only for open balances', () => {
  const position = { year: 2024, positionDate: '2024-06-30', accumulatedSinceJanuary: true, amounts };
  const selection = buildProposalProjection(position, '1010', { inReview: '50', pending: '0' });
  assert.equal(selection.rows.length, 1);
  assert.deepEqual(selection.projected, { cancelled: 20110, inReview: 2701, pending: 1301, rejected: 56308 });
  assert.equal(selection.totals.inReview + selection.totals.pending, 6702);

  const total = buildProposalProjection(position, 'all', { inReview: '50', pending: '100' });
  assert.equal(total.projected.cancelled, total.rows.reduce((sum, row) => sum + row.forecast.cancelled, 0));
  assert.equal(total.projected.pending, 0);
  assert.equal(buildProposalProjection({ ...position, accumulatedSinceJanuary: false }).projected.rejected, null);
  assert.deepEqual(buildProposalProjection({ ...position, positionDate: null, accumulatedSinceJanuary: false }, 'all', { inReview: '101', pending: '' }).projected,
    { cancelled: null, inReview: null, pending: null, rejected: null });

  const closed = buildProposalProjection({ ...position, positionDate: '2024-12-31' }, '1011', { pending: '100' });
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.projected, { cancelled: 30000, inReview: 3000, pending: 6000, rejected: 11000 });
  assert.throws(() => validateProposalDate(2026, '2026-02-29', true), /data-base/);
  assert.throws(() => validateProposalDate(2026, '2025-12-31', true), /data-base/);
  assert.throws(() => validateProposalDate(2026, null, true), /acumulado/);
  assert.doesNotThrow(() => validateProposalDate(2024, '2024-02-29', true));
});
