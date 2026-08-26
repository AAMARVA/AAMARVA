process.env.NODE_ENV = 'production';
const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/',
  method: 'GET'
}, (res) => {
  console.log('HEADERS:');
  console.log(res.headers);
  process.exit(0);
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
  process.exit(1);
});
req.end();
