import { getTickets } from './server/services/ticketService';
async function test() {
    try {
        const result = await getTickets('', 1, 20);
        console.log('Tickets:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
