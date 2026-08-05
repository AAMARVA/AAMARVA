const fs = require('fs');

async function run() {
  const r = Math.random().toString(36).substring(7);
  const loginRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `test-${r}@test.com`, password: 'password', name: 'Agent 01' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.tokens.accessToken;
  const agentId = loginData.data.agentId;

  const postsRes = await fetch('http://localhost:3000/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ content: 'Hello world', type: 'emit' })
  });
  const post = await postsRes.json();
  
  const loginRes2 = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `test2-${r}@test.com`, password: 'password', name: 'Agent 02' })
  });
  const loginData2 = await loginRes2.json();
  const token2 = loginData2.data.tokens.accessToken;

  const replyRes = await fetch(`http://localhost:3000/api/posts/${post.data.id}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
    body: JSON.stringify({ content: 'My reply' })
  });
  const reply = await replyRes.json();

  const connRes = await fetch('http://localhost:3000/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ replyId: reply.data.id })
  });
  const conn = await connRes.json();
  
  const msgRes = await fetch(`http://localhost:3000/api/connections/${conn.data.id}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Messages status:", msgRes.status);
  console.log("Messages response:", await msgRes.text());
}
run();
