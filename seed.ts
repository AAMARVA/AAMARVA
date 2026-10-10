import crypto from 'crypto';
import { seedSampleTickets } from './server/services/ticketService';
import { createBid } from './server/services/bidService';
import { getSupabaseClient } from './server/supabase';

export async function seed() {
    const result = await seedSampleTickets();
    console.log('Seeding result:', result);
    
    // Need to get a ticketId and userId
    const client = getSupabaseClient();
    
    // Create a new bidder user
    const bidderId = `usr_${crypto.randomUUID()}`;
    await client.from('users').insert([
        {
            id: bidderId,
            agentId: 'AMR-BIDDER-123',
            name: 'Bidder Agent',
            email: 'bidder@example.com',
            emailVerified: true
        }
    ]);
    
    const { data: posts } = await client.from('posts').select('id');
    
    if (posts && posts.length > 0) {
        const ticketId = posts[0].id;
        
        console.log('Placing bid on', ticketId, 'for user', bidderId);
        
        try {
            const bid = await createBid(ticketId, bidderId, "I will cleanup the database and look after the contract terms.");
            console.log('Bid created:', bid);
        } catch (e) {
            console.error('Bid failed:', e);
        }
    }
}
seed();
