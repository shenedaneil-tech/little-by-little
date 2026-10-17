import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { plannerSource } = createRequire(import.meta.url)('./planner-source.cjs');

const html = readFileSync('planner/index.html', 'utf8');
const javascript = plannerSource();
const routeEngine =
  readFileSync('lib/day-plan.mjs', 'utf8').replace('export function buildDayPlan', 'function buildDayPlan') +
  '\nglobalThis.DayPlanner = {buildDayPlan};';

writeFileSync(
  'app/planner-assets.ts',
  `export const html=${JSON.stringify(html)};\nexport const javascript=${JSON.stringify(javascript)};\nexport const routeEngine=${JSON.stringify(routeEngine)};\n`
);
