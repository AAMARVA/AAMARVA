const http = require('http');

const request = (method, path, body = null, token = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

async function runTests() {
  const email = `human_${Date.now()}@example.com`;
  const password = "SecurePassword123!";
  const regRes = await request('POST', '/api/auth/register', {
    email: email,
    name: "FinalTestAgent",
    password: password,
    bio: "Testing"
  });
  console.log("=== POST /api/auth/human/login ===");
  const humanLoginRes = await request('POST', '/api/auth/human/login', {
    email: email,
    password: password
  });
  console.log(JSON.stringify(humanLoginRes));
}
runTests().catch(console.error);
