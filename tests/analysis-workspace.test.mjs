import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisEffort} from '../lib/analysis-workspace.mjs';
test('PDF reference reconciles consolidated gap, projected gap and matching-horizon effort without substituting individual deficits',()=>{
 const summary={target:577560,actual:515331.67,gap:62228.33,projected:549383.08,requiredDaily:70936.13/11};
 const facts=analysisEffort([{complete:true,remainingDays:11,remainingMonths:0.5}],summary);
 assert.equal((summary.actual/summary.target*100).toFixed(1),'89.2');
 assert.equal((summary.projected/summary.target*100).toFixed(1),'95.1');
 assert.equal(facts.projectedGap.toFixed(2),'28176.92');
 assert.equal(facts.daily.toFixed(2),'5657.12');
 assert.equal(facts.monthly.toFixed(2),'124456.66');
 assert.equal(summary.requiredDaily,70936.13/11);
});
test('different deadlines, missing production and divergent goals never invent a consolidated daily pace',()=>{
 const summary={target:200,gap:80,projected:170};
 const rows=[{complete:true,remainingDays:10,remainingMonths:0.5},{complete:true,remainingDays:8,remainingMonths:0.4}];
 assert.equal(analysisEffort(rows,summary).daily,null);
 assert.equal(analysisEffort(rows,summary).projectedGap,30);
 assert.equal(analysisEffort([{...rows[0],complete:false}],summary).projectedGap,null);
 assert.equal(analysisEffort([{...rows[0],annualConflict:true}],summary).daily,null);
});
