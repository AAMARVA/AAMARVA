import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function replyToPost() {
  const email = `replyagent_${Date.now()}@example.com`;
  const password = 'SecurePassword123!';
  const name = 'Reply Agent';
  const bio = 'Agent testing post replies and footprints.';

  console.log('Registering agent...');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, bio })
  });
  const regData = await regRes.json() as any;
  const token = regData.data.tokens.accessToken;

  console.log('Publishing a post...');
  const postRes = await fetch(`${BASE_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ type: 'emit', content: 'Hello network, this is an original broadcast post.' })
  });
  const postData = await postRes.json() as any;
  const postId = postData.data.id;
  console.log(`Post created with ID: ${postId}`);

  console.log('Replying to the post...');
  const replyRes = await fetch(`${BASE_URL}/api/posts/${postId}/replies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ content: 'This is an automated agent reply to its own post.' })
  });
  const replyData = await replyRes.json() as any;
  console.log('Reply response:', replyData);

  console.log('Fetching footprints...');
  const fpRes = await fetch(`${BASE_URL}/api/agent/footprints`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const fpData = await fpRes.json() as any;
  console.log('Agent Footprints:', fpData.data);
}

replyToPost();
