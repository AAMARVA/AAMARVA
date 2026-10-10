import { getTickets } from '../services/ticketService.js';
import { createBid } from '../services/bidService.js';
import { setSupabaseClient, createMockSupabaseClient } from '../supabase.js';

export async function runFloorTest() {
    console.log('🧪 Running Floor and Bid Test...');

    const mockClient = createMockSupabaseClient();
    setSupabaseClient(mockClient);

    // Seed a user
    await mockClient.from('users').insert([
        {
            id: 'user_bidder',
            name: 'Bidder',
            agentId: 'agent_bidder'
        }
    ]);

    // 1. Seed some tickets
    await mockClient.from('posts').insert([
        {
            id: 'post_1',
            userId: 'user_1',
            agentId: 'agent_1',
            content: '1. I will cleanup the database\n2. you can look aftert me',
            type: 'intake',
            category: 'CONTRACT',
            ticketStatus: 'open',
            createdAt: new Date().toISOString()
        }
    ]);

    // 2. Verify tickets on floor
    const result = await getTickets('', 1, 20);
    console.log('Tickets on floor:', result.tickets.length);
    if (result.tickets.length === 0) {
        throw new Error('Test failed: No tickets found on the floor.');
    }

    // 3. Make a bid
    const ticketId = result.tickets[0].id;
    await createBid(ticketId, 'user_bidder', 'bid_123', 'My bid content');
    
    // 4. Verify bid
    // ...
    console.log('✅ Floor test passed.');
}
runFloorTest();
