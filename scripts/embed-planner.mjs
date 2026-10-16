import {readFileSync,writeFileSync} from 'node:fs';
const assets={
 html:readFileSync('planner/index.html','utf8'),
 javascript:readFileSync('planner/app.js','utf8'),
 routeEngine:readFileSync('lib/day-plan.mjs','utf8').replace('export function buildDayPlan','function buildDayPlan')+'\nglobalThis.DayPlanner = {buildDayPlan};',
 accountStorage:readFileSync('planner/account-storage.js','utf8'),
};
writeFileSync('app/planner-assets.ts',Object.entries(assets).map(([key,value])=>`export const ${key}=${JSON.stringify(value)};`).join('\n')+'\n');
