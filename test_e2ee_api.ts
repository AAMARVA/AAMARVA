import { getSupabaseClient } from './server/supabase.js';
import fetch from 'node-fetch';

async function test() {
    console.log("Running E2EE tests...");
    
    // We don't have a live server in this script easily, let's just use the services directly for A and B.
    // A: POST plaintext message -> rejected
    // We can simulate calling the route or just check the service.
    // Wait, the API routes aren't easily testable without spinning up express.
    // I can test sendMessage.
    
    const { sendMessage } = await import('./server/services/connectionService.js');
    
    const sb = getSupabaseClient();
    const testConnectionId = 'conn_seed_1788333997433';
    const testUserId = 'usr_nexus_01';
    
    try {
        console.log("Test A: POST plaintext message");
        await sendMessage(testConnectionId, testUserId, {
            content: "Plaintext"
        } as any);
        console.error("FAIL: Accepted plaintext message.");
    } catch (e: any) {
        if (e.code === 'PLAINTEXT_REJECTED' || e.message.includes('Plaintext content is not allowed')) {
            console.log("PASS: Plaintext rejected.");
        } else {
            console.error("FAIL: Incorrect rejection:", e.message);
        }
    }
    
    try {
        console.log("Test B: POST ciphertext message");
        const msg = await sendMessage(testConnectionId, testUserId, {
            ciphertext: "base64...",
            nonce: "nonce...",
            version: 1,
            keyEpoch: 1
        });
        console.log("PASS: Accepted ciphertext message.", msg.id);
        
        console.log("Test C: Accepted private message -> DB content is NULL");
        const { data: dbMsg } = await sb.from('messages').select('content').eq('id', msg.id).single();
        if (dbMsg && dbMsg.content === null) {
            console.log("PASS: Database content is NULL");
        } else {
            console.error("FAIL: Database content is not NULL", dbMsg);
        }
        
        console.log("Test D/E: GET private message");
        const { getConnectionMessages } = await import('./server/services/connectionService.js');
        const msgs = await getConnectionMessages(testConnectionId, testUserId);
        const retrievedMsg = msgs.find(m => m.id === msg.id);
        if (retrievedMsg && retrievedMsg.content === null && retrievedMsg.ciphertext === "base64...") {
            console.log("PASS: GET message content is NULL and ciphertext returned.");
        } else {
            console.error("FAIL: GET message incorrect", retrievedMsg);
        }
        
        // cleanup
        await sb.from('messages').delete().eq('id', msg.id);
    } catch (e: any) {
        console.error("FAIL with unexpected error:", e);
    }
    
    console.log("Test F: Unauthorized user");
    try {
        const { getConnectionMessages } = await import('./server/services/connectionService.js');
        await getConnectionMessages(testConnectionId, 'some_unauthorized_user');
        console.error("FAIL: Expected authorization error.");
    } catch (e: any) {
        if (e.code === 'USER_NOT_FOUND' || e.code === 'FORBIDDEN') {
            console.log("PASS: Unauthorized user cannot retrieve messages. Code:", e.code);
        } else {
            console.error("FAIL: Incorrect authorization error:", e);
        }
    }
}
test().catch(console.error);
