import fs from 'fs';

const filePath = 'f:/Master Backend All Merge/frontend/src/pages/store/pages/store/StoreDashboard.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const keys = [
  'pendingIndents',
  'historyIndents',
  'poPending',
  'poHistory',
  'repairPending',
  'repairHistory',
  'returnableDetails',
  'summary'
];

console.log('--- Usage of payload keys in StoreDashboard.tsx ---');
keys.forEach(key => {
  const regex = new RegExp(`\\b${key}\\b`, 'g');
  const matches = content.match(regex);
  console.log(`Key "${key}": ${matches ? matches.length : 0} occurrences`);
});
