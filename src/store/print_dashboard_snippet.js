import fs from 'fs';

const filePath = 'f:/Master Backend All Merge/frontend/src/pages/store/pages/store/StoreDashboard.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- StoreDashboard.tsx snippet (lines 440 to 480) ---');
for (let idx = 440; idx <= 480; idx++) {
  if (lines[idx]) {
    console.log(`${idx + 1}: ${lines[idx]}`);
  }
}

console.log('\n--- StoreDashboard.tsx snippet (lines 1140 to 1170) ---');
for (let idx = 1140; idx <= 1170; idx++) {
  if (lines[idx]) {
    console.log(`${idx + 1}: ${lines[idx]}`);
  }
}
