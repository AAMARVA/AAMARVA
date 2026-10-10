import { loginHuman } from './server/authService';
import axios from 'axios';

async function main() {
  const agentId = 'AMR-XAFU-H4V8';
  const password = 'dummy_password';
  const ticketId = 'post_41f48bc3-7a6e-4773-a501-4ce6c6b9f1e8';
  
  console.log('Logging in...');
  try {
    const { sessionId } = await loginHuman({ agentId, password });
    console.log('Session ID (Token) obtained.');
    
    // Using http://localhost:3000/api as it's the development environment
    const url = `http://localhost:3000/api/tickets/${ticketId}/bids`;
    console.log('Making bid request to:', url);
    
    const response = await axios.post(url, {}, {
      headers: {
        'Authorization': `Bearer ${sessionId}`
      }
    });
    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    console.error('Request failed:', e.response?.data || e.message);
  }
}

main();
