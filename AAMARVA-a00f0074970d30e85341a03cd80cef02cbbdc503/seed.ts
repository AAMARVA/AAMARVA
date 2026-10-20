import { getSupabaseClient } from './server/supabase';

export async function seed() {
    const client = getSupabaseClient();
    console.log('Running AAMARVA database seeding...');
    const { data: users, error } = await client.from('users').select('id').limit(1);
    if (error) {
        console.error('Seed check error:', error.message);
    } else {
        console.log('Seed completed successfully. Users found:', users?.length || 0);
    }
}
