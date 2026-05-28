import fs from 'fs';

const filePath = 'f:/Master Backend All Merge/frontend/src/pages/store/pages/store/StoreDashboard.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Find where pendingIndents or historyIndents or poPending are used
const lines = content.split('\n');
console.log('--- Checking references to pendingIndents ---');
lines.forEach((line, idx) => {
  if (line.includes('pendingIndents') && (line.includes('.map') || line.includes('.slice') || line.includes('length') || line.includes('Table') || line.includes('rows'))) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

console.log('\n--- Checking references to poPending ---');
lines.forEach((line, idx) => {
  if (line.includes('poPending') && (line.includes('.map') || line.includes('.slice') || line.includes('length') || line.includes('Table') || line.includes('rows'))) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
