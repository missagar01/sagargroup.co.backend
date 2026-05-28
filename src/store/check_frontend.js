import fs from 'fs';
import path from 'path';

const filePath = 'f:/Master Backend All Merge/frontend/src/pages/store/pages/store/StoreDashboard.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Find all lines containing fetch, axios, or endpoint patterns
const lines = content.split('\n');
console.log('--- API Calls or Endpoints in StoreDashboard.tsx ---');
lines.forEach((line, index) => {
  if (line.includes('/dashboard') || line.includes('api/') || line.includes('fetch') || line.includes('axios')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
