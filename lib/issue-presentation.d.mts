import type {Issue} from './types';
export function issueCategory(issue:Issue):'attention'|'information'|'method';
export function actionableIssueCount(issues:Issue[]):number;
export function groupIssues(issues:Issue[]):(Issue&{category:string;count:number;occurrences:Issue[]})[];
