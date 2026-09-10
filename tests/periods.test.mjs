import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisMonth, currentCalendarMonth, PERIOD_OPTIONS, periodCoverage, periodTitle } from '../lib/periods.mjs';
import { analyze, periodBounds } from '../lib/analytics.mjs';
import { buildPortfolioReport, renderPortfolioCommunication } from '../lib/portfolio-communication.mjs';
import { compareYears, networkSummary } from '../lib/scenarios.mjs';
import { portfolioFixture, unit } from './portfolio-fixture.mjs';

const dataset = portfolioFixture();
test('only the five requested period types are selectable', () => {
  assert.deepEqual(Object.keys(PERIOD_OPTIONS), ['month', 'quarter', 'semester', 'annual', 'ytd']);
});
test('calendar month follows Brasilia across UTC month/year boundaries', () => {
  for (const [date, expected] of [['2026-10-01T02:59:59Z',8],['2026-10-01T03:00:00Z',9],['2027-01-01T02:59:59Z',11],['2027-01-01T03:00:00Z',0]])
    assert.equal(currentCalendarMonth(new Date(date)), expected);
  assert.throws(() => currentCalendarMonth(new Date('invalid')));
});
test('YTD always ends in the calendar month, independent of earlier selection and source cutoff', () => {
  for (let calendar = 0; calendar < 12; calendar++) for (let selected = 0; selected < 12; selected++) {
    const month = analysisMonth('ytd', selected, calendar);
    assert.equal(month, calendar);
    const bounds = periodBounds(2026, month, 'ytd');
    assert.equal(bounds.first, 0); assert.equal(bounds.last, calendar);
  }
});
test('full annual target never depends on a previously selected month', () => {
  for (let month = 0; month < 12; month++) {
    assert.equal(analysisMonth('annual', month, 8), 11);
    assert.equal(periodCoverage('annual', month, 2026), 'JAN–DEZ/2026');
  }
});
test('all 12 monthly periods and leap February retain exact dates', () => {
  for (let month = 0; month < 12; month++) {
    const value = analysisMonth('month', month, 8), range = periodBounds(2024, value, 'month');
    assert.equal(value, month); assert.equal(range.first, month); assert.equal(range.last, month);
  }
  assert.equal(periodBounds(2024, 1, 'month').end, '2024-02-29');
});
for (const [period, count, span] of [['quarter',4,3],['semester',2,6]]) {
  for (let index = 1; index <= count; index++) test(`${index} ${period}: selectors, totals, labels and hierarchy agree`, () => {
    const month = analysisMonth(period, index * span - 1, 8), range = periodBounds(2026, month, period);
    assert.equal(range.first, (index - 1) * span); assert.equal(range.last, index * span - 1);
    for (let childMonth = range.first; childMonth <= range.last; childMonth++) assert.equal(analysisMonth(period, childMonth, 8), month);
    for (const [id, monthly] of [['central:1002',200],['cooperative:1002:3017',100],['pa:1002:3017:0',450]]) {
      const report = buildPortfolioReport({dataset,entity:unit(dataset,id),month,period});
      const current = report.sections[0].current, message = renderPortfolioCommunication(report);
      assert.equal(current.target, monthly * span); assert.equal(current.start, range.start); assert.equal(current.end, range.end);
      assert.equal(report.periodLabel, periodTitle(period, month, 2026));
      assert.ok(message.text.includes(report.periodLabel)); assert.ok(message.whatsapp.includes(report.periodLabel));
      assert.equal(message.dashboard.periodLabel, report.periodLabel);
    }
  });
}
test('YTD meta, realized, network and historical comparison share the requested interval without inventing data', () => {
  const before = structuredClone(dataset), month = analysisMonth('ytd', 0, 8);
  const filters = {period:'ytd', month, central:'1002', coop:'1002:3017', source:'base', metric:'VN', level:'cooperative'};
  const report = buildPortfolioReport({dataset,entity:unit(dataset,'cooperative:1002:3017'),period:'ytd',month});
  assert.equal(report.sections[0].current.target, 900); assert.equal(report.sections[0].current.actual, 400);
  assert.equal(report.sections[0].current.phase, 'Parcial');
  const network = networkSummary(dataset, filters); assert.equal(network.pas[0].target, 4050);
  const previous = JSON.parse(JSON.stringify(dataset).replaceAll('2026','2025'));
  const comparison = compareYears(dataset, previous, filters);
  assert.equal(comparison.first, 0); assert.equal(comparison.last, 7); // Only the eight closed months.
  assert.equal(comparison.rows[0].current.actual, 400);
  assert.deepEqual(dataset, before);
});
test('Arrecadacao keeps its own quarter and semester goals', () => {
  for (const [period, ref, expected] of [['quarter',5,3000],['semester',5,6000],['annual',11,12000],['ytd',8,9000]]) {
    const report = buildPortfolioReport({dataset,entity:unit(dataset,'cooperative:1002:3017'),metric:'AR',period,month:analysisMonth(period,ref,8)});
    assert.equal(report.sections[0].current.target, expected);
  }
});
test('unknown production and manual historical goals survive period changes', () => {
  const row = {...dataset.rows[0], actuals:Array(12).fill(null),targets:Array(12).fill(200),annualTarget:2400,targetRule:'manual'};
  assert.equal(analyze(row,{year:2026,month:5,period:'semester'}).target,1200);
  assert.equal(analyze(row,{year:2026,month:5,period:'semester'}).actual,null);
});
test('legacy daily reports stay readable but cannot be selected by the new UI', () => {
  const report = buildPortfolioReport({dataset,entity:unit(dataset,'cooperative:1002:3017'),period:'daily',month:7});
  assert.match(renderPortfolioCommunication(report).dashboard.periodLabel, /Esforço diário/);
  assert.throws(() => analysisMonth('daily',7,8));
});
test('invalid period selections never yield out-of-bounds dates', () => {
  for (const invalid of [-1,12,NaN,2.5,'2']) assert.throws(() => analysisMonth('month',invalid,8));
  assert.throws(() => analysisMonth('quarter',0,12));
});
