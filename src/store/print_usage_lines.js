import fs from 'fs';

const filePath = 'f:/Master Backend All Merge/frontend/src/pages/store/pages/store/StoreDashboard.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- Printing lines containing pendingIndents/historyIndents ---');
lines.forEach((line, index) => {
  if (line.includes('pendingIndents') || line.includes('historyIndents')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
