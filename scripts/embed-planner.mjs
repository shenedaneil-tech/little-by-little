import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { plannerSource } = createRequire(import.meta.url)('./planner-source.cjs');

const assets = {
  html: readFileSync('planner/index.html', 'utf8'),
  javascript: plannerSource(),
  routeEngine:
    readFileSync('lib/day-plan.mjs', 'utf8').replace('export function buildDayPlan', 'function buildDayPlan') +
    '\nglobalThis.DayPlanner = {buildDayPlan};',
  accountStorage: readFileSync('planner/account-storage.js', 'utf8')
};
writeFileSync(
  'app/planner-assets.ts',
  Object.entries(assets)
    .map(([key, value]) => `export const ${key}=${JSON.stringify(value)};`)
    .join('\n') + '\n'
);
