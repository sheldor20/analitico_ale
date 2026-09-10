import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, analyze, money } from '../lib/analytics.mjs';
import { analysisRows } from '../lib/registry.mjs';
import { buildEmailFile, buildOutlookLink, buildPortfolioReport, buildWhatsappLink, entityFromAnalysis, escapeHtml, normalizeRecipients, PERIOD_LABELS, recipientsForContacts, renderPortfolioCommunication, whatsappNumber } from '../lib/portfolio-communication.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';
const reportFor = (dataset, id, extra = {}) => buildPortfolioReport({ dataset, entity: unit(dataset, id), month: 7, period: 'ytd', ...extra });

test('cooperative communication isolates Central + Cooperative and never adds PA production', () => {
  const dataset = portfolioFixture();
  const before = structuredClone(dataset);
  const report = reportFor(dataset, 'cooperative:1002:3017');
  assert.equal(report.sections[0].current.actual, 400);
  assert.equal(report.sections[0].current.target, 800);
  assert.equal(report.sections[0].annual.target, 1200);
  assert.equal(report.sections[0].annual.gap, 800);
  assert.deepEqual(dataset, before, 'generation must never modify the fixed dataset');
  const text = renderPortfolioCommunication(report).text;
  assert.doesNotMatch(text, /Outra central|Cooperativa Beta|PA Beta/);
});
test('Central shows net gap separately from the sum of individual cooperative gaps', () => {
  const report = reportFor(portfolioFixture(), 'central:1002');
  const section = report.sections[0];
  assert.equal(section.current.actual, 1600);
  assert.equal(section.current.target, 1600);
  assert.equal(section.current.gap, 0);
  assert.equal(section.individualGap, 400);
  assert.equal(section.priorities.length, 1);
  assert.match(section.priorities[0].name, /Alfa/);
  assert.match(renderPortfolioCommunication(report).text, /não compensado/);
});
test('PA zero is valid and does not include a PA zero at another cooperative', () => {
  const report = reportFor(portfolioFixture(), 'pa:1002:3017:0', { includeBoth: true });
  assert.equal(report.source, 'cadence');
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0].metric, 'VN');
  assert.equal(report.sections[0].current.actual, 1800);
  assert.equal(report.sections[0].current.target, 3600);
  assert.match(renderPortfolioCommunication(report).text, /PA 0/);
});
test('Venda Nova and Arrecadacao use separate metrics and cuts', () => {
  const report = reportFor(portfolioFixture(), 'cooperative:1002:3017', { includeBoth: true });
  assert.equal(report.sections.length, 2);
  assert.equal(report.sections[0].current.actual, 400);
  assert.equal(report.sections[1].current.actual, 5600);
  assert.equal(report.sections[1].current.target, 8000);
});
for (const period of Object.keys(PERIOD_LABELS)) test(`${period}: report matches existing engine and preserves annual scope`, () => {
  const dataset = portfolioFixture();
  const row = aggregate(analysisRows(dataset).filter((row) => row.central === '1002' && row.cooperative === '3017' && row.source === 'base' && row.metric === 'VN'), 'cooperative')[0];
  const report = reportFor(dataset, 'cooperative:1002:3017', { period });
  const expected = analyze(row, { year: 2026, month: 7, period, uplift: 0 });
  for (const key of ['target', 'actual', 'attainment', 'projected', 'gap', 'requiredDaily', 'requiredMonthly', 'status', 'phase']) assert.equal(report.sections[0].current[key], expected[key]);
  assert.equal(report.sections[0].annual.target, 1200);
  if (period === 'daily') assert.match(renderPortfolioCommunication(report).text, /Não há realizado diário disponível/);
});
test('unknown actuals are not zero and do not get a fabricated attainment', () => {
  const dataset = portfolioFixture();
  dataset.rows.find((row) => row.source === 'base' && row.central === '1002' && row.cooperative === '3017' && row.metric === 'VN').actuals[0] = null;
  const report = reportFor(dataset, 'cooperative:1002:3017');
  assert.equal(report.sections[0].current.complete, false);
  assert.equal(report.sections[0].current.attainment, null);
  assert.equal(report.sections[0].current.projected, null);
  assert.match(renderPortfolioCommunication(report).text, /dados incompletos/);
});
test('different cuts in a Central are declared and projection stays unavailable', () => {
  const dataset = portfolioFixture();
  const beta = dataset.rows.find((row) => row.source === 'base' && row.cooperative === '3025' && row.metric === 'VN');
  beta.cutoff = '2026-07-31'; beta.actuals[7] = null;
  const report = reportFor(dataset, 'central:1002');
  assert.equal(report.sections[0].current.projected, null);
  assert.match(renderPortfolioCommunication(report).text, /cortes diferentes, sem posição única/);
});
test('negative adjustments survive all channels', () => {
  const dataset = portfolioFixture();
  const row = dataset.rows.find((row) => row.source === 'base' && row.central === '1002' && row.cooperative === '3017' && row.metric === 'VN');
  row.actuals[7] = -25;
  const report = reportFor(dataset, 'cooperative:1002:3017', { period: 'month' });
  const output = renderPortfolioCommunication(report);
  assert.equal(report.sections[0].current.actual, -25);
  for (const key of ['text', 'whatsapp', 'html']) assert.ok(output[key].includes(money(-25)));
});
test('report and selections reject invalid context', () => {
  const dataset = portfolioFixture();
  for (const month of [-1, 12, 0.5, NaN]) assert.throws(() => reportFor(dataset, 'central:1002', { month }));
  assert.throws(() => reportFor(dataset, 'central:1002', { period: 'invalid' }));
  assert.throws(() => reportFor(dataset, 'central:1002', { entity: { ...unit(dataset, 'central:1002'), id: 'other' } }));
});
test('analysis identity resolves central, cooperative and PA without inherited names or codes', () => {
  assert.equal(entityFromAnalysis({ key: 'base:VN:central:1002', source: 'base', central: '1002', cooperative: '', name: 'Bahia' }).id, 'central:1002');
  assert.equal(entityFromAnalysis({ key: 'base:VN:cooperative:1002:3017', source: 'base', central: '1002', cooperative: '3017', name: 'Alfa' }).id, 'cooperative:1002:3017');
  assert.equal(entityFromAnalysis({ key: 'cadence:1002:3017:0:VN', source: 'cadence', central: '1002', cooperative: '3017', pa: 0, name: 'PA zero' }).id, 'pa:1002:3017:0');
});
test('responsible contacts must match year, hierarchy, kind and exact entity', () => {
  const entity = unit(portfolioFixture(), 'pa:1002:3017:0');
  const matching = { workspaceYear: 2026, entityId: entity.id, entityKind: 'pa', central: '1002', cooperative: '3017', pa: '0', name: 'Test' };
  assert.deepEqual(recipientsForContacts([matching, { ...matching, workspaceYear: 2025 }, { ...matching, cooperative: '3025' }, { ...matching, central: '2007' }, { ...matching, entityKind: 'cooperative' }], 2026, entity), [matching]);
});
test('multiple emails deduplicate case-insensitively and reject header/url injection', () => {
  assert.deepEqual(normalizeRecipients(' Ana@Example.com ; bob@example.com\nana@example.com'), ['ana@example.com', 'bob@example.com']);
  assert.equal(normalizeRecipients(Array.from({ length: 12 }, (_, i) => `person${i}@example.com`)).length, 12, 'limit is not 10 across multiple responsible people');
  for (const bad of ['bad', 'x@example.com?bcc=other@example.com', 'x@example.com\r\nBcc:other@example.com']) assert.throws(() => normalizeRecipients([bad]));
});
test('HTML escapes names and custom content while text and WhatsApp preserve the same KPIs', () => {
  const report = reportFor(portfolioFixture(), 'cooperative:1002:3017', { includeBoth: true });
  report.entity.name = '<img src=x onerror=alert(1)>';
  const message = renderPortfolioCommunication(report, { names: ['Ana'], intro: '<script>alert(1)</script>', signature: 'A & B' });
  assert.doesNotMatch(message.html, /<script|<img|onerror="/i);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /A &amp; B/);
  assert.match(message.whatsapp, /Olá, Ana!/);
  for (const section of report.sections) for (const value of [section.current.target, section.current.actual, section.annual.projected]) {
    for (const key of ['text', 'whatsapp', 'html']) assert.ok(message[key].includes(money(value)));
  }
  assert.equal(escapeHtml('"<&'), '&quot;&lt;&amp;');
});
test('Outlook links encode special characters and preserve recipients subject and full body', () => {
  const input = { recipients: ['ana+test@example.com', 'b@example.com'], subject: 'Carteira & ação + meta', body: 'Olá, Ana!\nR$ 400,00 & 50% + ação' };
  const link = buildOutlookLink(input);
  const parsed = new URL(link.url);
  assert.equal(parsed.hostname, 'outlook.office.com');
  assert.equal(parsed.searchParams.get('to'), input.recipients.join(';'));
  assert.equal(parsed.searchParams.get('subject'), input.subject);
  assert.equal(parsed.searchParams.get('body'), input.body);
  assert.ok(link.url.includes('%20'));
  assert.equal(new URL(buildOutlookLink({ ...input, personal: true }).url).hostname, 'outlook.live.com');
  assert.throws(() => buildOutlookLink({ subject: 'bad\r\nBcc: injected' }));
});
test('long messages require pasting instead of being silently truncated', () => {
  const body = 'Informação íntegra & '.repeat(2000);
  const email = buildOutlookLink({ subject: 'Cenário', body });
  const whatsapp = buildWhatsappLink({ phone: '(71) 99999-9999', body });
  assert.equal(email.requiresPaste, true);
  assert.equal(new URL(email.url).searchParams.get('body'), null);
  assert.equal(whatsapp.requiresPaste, true);
  assert.equal(new URL(whatsapp.url).searchParams.get('text'), null);
});
test('WhatsApp phone encoding supports Brazil, explicit international numbers, and an empty recipient', () => {
  assert.equal(whatsappNumber('(71) 99999-9999'), '5571999999999');
  assert.equal(whatsappNumber('(55) 99999-9999'), '5555999999999');
  assert.equal(whatsappNumber('+1 (415) 555-2671'), '14155552671');
  const url = new URL(buildWhatsappLink({ phone: '+55 71 99999-9999', body: 'Olá & meta 50%\nCarteira' }).url);
  assert.equal(url.pathname, '/5571999999999');
  assert.equal(url.searchParams.get('text'), 'Olá & meta 50%\nCarteira');
  assert.equal(new URL(buildWhatsappLink({ body: 'Escolha' }).url).pathname, '/');
  assert.throws(() => whatsappNumber('javascript:alert(1)'));
  assert.throws(() => whatsappNumber('123'));
});
test('EML has UTF-8 plain and HTML alternatives, draft marker, and safe headers', () => {
  const message = renderPortfolioCommunication(reportFor(portfolioFixture(), 'cooperative:1002:3017'));
  const eml = buildEmailFile({ ...message, recipients: ['ana@example.com'] });
  assert.match(eml, /X-Unsent: 1\r\nTo: ana@example.com/);
  assert.match(eml, /Content-Type: multipart\/alternative/);
  const encoded = eml.split('Content-Transfer-Encoding: base64\r\n\r\n').slice(1).map((part) => part.split('\r\n--portfolio_alternative_v1')[0].replace(/\r\n/g, ''));
  assert.equal(Buffer.from(encoded[0], 'base64').toString('utf8'), message.text);
  assert.equal(Buffer.from(encoded[1], 'base64').toString('utf8'), message.html);
  assert.throws(() => buildEmailFile({ ...message, subject: 'Bad\nBcc:x@example.com' }));
});
