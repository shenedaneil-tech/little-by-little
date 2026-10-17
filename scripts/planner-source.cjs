// Joins the planner's source sections (planner/src/*.js) into the single script the page loads.
// Sections are joined in file-name order, so the numeric prefixes (01-, 02-, ...) set the order.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const dir = join(__dirname, '..', 'planner', 'src');

function plannerSource() {
  return readdirSync(dir)
    .filter(name => name.endsWith('.js'))
    .sort()
    .map(name => readFileSync(join(dir, name), 'utf8'))
    .join('');
}

module.exports = { plannerSource };
