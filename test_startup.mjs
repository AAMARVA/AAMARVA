process.env.JWT_SECRET = '';
process.env.JWT_REFRESH_SECRET = 'test';
process.env.SUPABASE_URL = 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
console.log('Testing missing JWT_SECRET...');
try {
  const { validateConfig } = await import('./server/config.js');
  validateConfig();
  console.log('FAIL: Config did not throw for missing JWT_SECRET');
} catch (e) {
  console.log('PASS: Caught expected error: ' + e.message);
}
