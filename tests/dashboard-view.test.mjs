import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDashboardRows, visibleLeafRows, effortLabel } from '../lib/dashboard-view.mjs';
import { analyze, aggregate, summarize, money } from '../lib/analytics.mjs';
import { portfolioFixture } from './portfolio-fixture.mjs';
import { analysisRows } from '../lib/registry.mjs';
test('dashboard: same search and status scope drives cards and displayed units', () => {
  const leaves = analysisRows(portfolioFixture()).filter(r=>r.source==='base'&&r.metric==='VN');
  const rows = aggregate(leaves,'cooperative').map(r=>analyze(r,{year:2026,month:7,period:'month',uplift:0}));
  const selected = filterDashboardRows(rows,'  aLFA  ');
  assert.equal(selected.length,1); assert.match(selected[0].name,/Alfa/);
  assert.equal(summarize(selected).actual,selected[0].actual);
  assert.equal(filterDashboardRows(rows,'absent-unit').length,0);
  assert.equal(filterDashboardRows(rows,'3025').length,1);
});
test('dashboard: central selection includes its leaves, not unrelated central or duplicate parent', () => {
  const leaves=[{central:'1002',cooperative:'3017'},{central:'1002',cooperative:'3025'},{central:'2007',cooperative:'4293'}];
  assert.deepEqual(visibleLeafRows(leaves,[{central:'1002'}],'central'),leaves.slice(0,2));
  assert.deepEqual(visibleLeafRows(leaves,[leaves[0]],'cooperative'),[leaves[0]]);
  assert.deepEqual(visibleLeafRows(leaves,[],'central'),[]);
});
test('dashboard: PA zero and identically numbered units in different parents stay isolated',()=>{
  const leaves=[{central:'1002',cooperative:'3017',pa:0},{central:'1002',cooperative:'3025',pa:0},{central:'2007',cooperative:'3017',pa:0}];
  assert.deepEqual(visibleLeafRows(leaves,[leaves[0]],'pa'),[leaves[0]]);
});
test('dashboard: daily effort never invents an estimate for closed or missing periods',()=>{
  assert.equal(effortLabel(null,0,money),'Meta do período atingida');
  for(const value of [null,undefined,NaN,Infinity]) assert.equal(effortLabel(value,100,money),'Sem estimativa diária disponível');
  assert.match(effortLabel(25,100,money),/25,00 por dia útil restante/);
});
