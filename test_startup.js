try {
  process.env.JWT_SECRET = '';
  process.env.JWT_REFRESH_SECRET = 'test';
  process.env.SUPABASE_URL = 'test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  console.log('Testing missing JWT_SECRET...');
  require('./server/config.js');
  console.log('FAIL: Config did not throw for missing JWT_SECRET');
} catch (e) {
  console.log('PASS: Caught expected error: ' + e.message);
}
