import {readFileSync,writeFileSync} from 'node:fs';
const html=readFileSync('planner/index.html','utf8'),javascript=readFileSync('planner/app.js','utf8'),routeEngine=readFileSync('lib/day-plan.mjs','utf8').replace('export function buildDayPlan','function buildDayPlan')+'\nglobalThis.DayPlanner = {buildDayPlan};';
writeFileSync('app/planner-assets.ts',`export const html=${JSON.stringify(html)};\nexport const javascript=${JSON.stringify(javascript)};\nexport const routeEngine=${JSON.stringify(routeEngine)};\n`);
