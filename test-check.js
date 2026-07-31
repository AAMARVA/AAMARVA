import fs from 'fs';
const content = fs.readFileSync('server/routes/aamarvaRoutes.ts', 'utf8');
console.log(content.includes('GET /api/agents') ? 'YES' : 'NO');
