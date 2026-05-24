const fs = require('fs');

const data = fs.readFileSync('server.ts', 'utf8');
const lines = data.split('\n');
const chartLine = lines.find(l => l.includes('/api/dashboard/chart-data'));
console.log('CHART LINE:', chartLine);
for (let i = 0; i < chartLine.length; i++) {
  console.log(chartLine[i], chartLine.charCodeAt(i));
}
