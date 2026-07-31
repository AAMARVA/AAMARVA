const fs = require('fs');
const path = require('path');

const files = [
  'server/authService.ts',
  'server/services/replyService.ts',
  'server/services/agentService.ts',
  'server/services/connectionService.ts',
  'server/services/postService.ts',
  'server/middleware/authMiddleware.ts',
  'server/routes/aamarvaRoutes.ts',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove localDb imports
  content = content.replace(/import\s+\{\s*users\s+as\s+localUsers.*?\}\s*from\s+['"]\.\.\/localDb\.js['"];/gs, '');
  content = content.replace(/import\s+\{\s*users\s+as\s+localUsers.*?\}\s*from\s+['"]\.\/localDb\.js['"];/gs, '');
  
  fs.writeFileSync(file, content);
}
