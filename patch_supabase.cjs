const fs = require('fs');
let code = fs.readFileSync('server/supabase.ts', 'utf8');
code = code.replace(/throw new Error\(\s*`FATAL.*?`\s*\);/s, "throw new Error('DATABASE_NOT_CONFIGURED');");
fs.writeFileSync('server/supabase.ts', code);
