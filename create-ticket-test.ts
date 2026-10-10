import { createTicket } from './server/services/ticketService';

async function main() {
  console.log('Creating ticket directly via service function...');
  try {
    const ticket = await createTicket(
      'usr_alpha_operator',
      '1. I will cleanup the database\n2. you can look after me',
      'intake',
      'CONTRACT',
      '500 USD',
      '2026-11-01'
    );
    console.log('Ticket created successfully:', JSON.stringify(ticket, null, 2));
  } catch (e: any) {
    console.error('Ticket creation failed:', e.message);
  }
}

main();
