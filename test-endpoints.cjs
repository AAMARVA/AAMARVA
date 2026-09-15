const http = require('http');

const endpoints = [
  { method: 'GET', path: '/api/telemetry/activity' },
  { method: 'POST', path: '/api/auth/check-email' },
  { method: 'POST', path: '/api/auth/refresh' },
  { method: 'GET', path: '/api/agents/me' },
  { method: 'GET', path: '/api/agents/me/e2ee' },
  { method: 'PUT', path: '/api/agents/me' },
  { method: 'GET', path: '/api/agents/123' },
  { method: 'DELETE', path: '/api/agents/me' },
  { method: 'GET', path: '/api/posts' },
  { method: 'POST', path: '/api/posts' },
  { method: 'GET', path: '/api/posts/me' },
  { method: 'GET', path: '/api/posts/123' },
  { method: 'PUT', path: '/api/posts/123' },
  { method: 'DELETE', path: '/api/posts/123' },
  { method: 'GET', path: '/api/posts/123/connections' },
  { method: 'GET', path: '/api/posts/123/replies' },
  { method: 'POST', path: '/api/posts/123/replies' },
  { method: 'GET', path: '/api/replies' },
  { method: 'GET', path: '/api/replies/me' },
  { method: 'GET', path: '/api/replies/123' },
  { method: 'PUT', path: '/api/replies/123' },
  { method: 'DELETE', path: '/api/replies/123' },
  { method: 'POST', path: '/api/connections' },
  { method: 'GET', path: '/api/connections' },
  { method: 'GET', path: '/api/connections/123/peer-key' },
  { method: 'GET', path: '/api/connections/123/messages' },
  { method: 'POST', path: '/api/connections/123/messages' },
  { method: 'DELETE', path: '/api/connections/123' },
  { method: 'GET', path: '/api/connection-requests/recent' },
  { method: 'GET', path: '/api/connections/recent' },
  { method: 'GET', path: '/api/connections/requests' },
  { method: 'POST', path: '/api/connections/requests' },
  { method: 'POST', path: '/api/connections/requests/123/accept' },
  { method: 'GET', path: '/api/stats/agents' },
  { method: 'POST', path: '/api/adk/auth/agent' },
  { method: 'POST', path: '/api/rotate-api-key' },
  { method: 'POST', path: '/api/auth/change-email/request' },
  { method: 'POST', path: '/api/auth/change-email/verify' },
  { method: 'POST', path: '/api/auth/verify-email/request' },
  { method: 'GET', path: '/api/auth/verify-email/confirm' },
  { method: 'POST', path: '/api/auth/verify-email/confirm' },
  { method: 'POST', path: '/api/auth/forgot-password' },
  { method: 'POST', path: '/api/auth/reset-password' },
  { method: 'GET', path: '/api/realtime/stream' },
  { method: 'POST', path: '/api/realtime/events' },
  { method: 'GET', path: '/api/agent/footprints' },
  { method: 'GET', path: '/api/webhooks/events' },
  { method: 'POST', path: '/api/counter-party-score' },
  { method: 'GET', path: '/api/counter-party-score' },
  { method: 'DELETE', path: '/api/counter-party-score/123' }
];

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint.path,
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      // 2xx, 3xx, 400, 401, 403, 404, 405 (method not allowed) are considered "PASS" in terms of server not crashing.
      // But let's check specifically for 5xx which is definitely a FAIL, or 404 which might mean route isn't mounted correctly if we didn't specify dynamic params correctly.
      // Since it's Express, if the route exists but we don't have auth, it'll return 401. If it expects a body, it might return 400.
      let status = 'FAIL (5xx)';
      if (res.statusCode < 500) {
          if (res.statusCode === 404 && !endpoint.path.includes('123')) {
              status = `FAIL (404 Not Found)`;
          } else {
             status = `PASS (${res.statusCode})`;
          }
      }
      
      resolve(`${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(40)} => ${status}`);
    });

    req.on('error', (e) => {
      resolve(`${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(40)} => FAIL (${e.message})`);
    });

    if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
      req.write(JSON.stringify({ dummy: 'data' }));
    }
    req.end();
  });
}

async function runTests() {
  console.log('Testing endpoints...');
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    console.log(result);
  }
}

runTests();
