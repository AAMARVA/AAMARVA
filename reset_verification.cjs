const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runReset() {
  console.log('--- Starting One-Time Verification Reset ---');

  // 1. Get initial counts
  const { count: totalBefore } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: verifiedBeforeDB } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('emailVerified', true);
  
  console.log(`Total DB users before: ${totalBefore}`);
  console.log(`Verified DB users before: ${verifiedBeforeDB}`);

  // 2. Reset public.users table
  const { error: dbError } = await supabase
    .from('users')
    .update({ emailVerified: false, emailVerifiedAt: null })
    .neq('id', 'impossible-id-to-match-all'); 
    
  if (dbError) {
    console.error('DB Update Error:', dbError);
    return;
  }
  console.log('Successfully executed UPDATE on public.users.');

  // 3. Reset Auth app_metadata
  const { data: usersData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Auth List Error:', authError);
    return;
  }
  
  let authResetCount = 0;
  for (const user of usersData.users) {
    if (user.app_metadata?.emailVerified === true || user.email_confirm_at) {
      const newAppMetadata = { ...user.app_metadata, emailVerified: false, emailVerifiedAt: null };
      await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: newAppMetadata,
        email_confirm: false
      });
      authResetCount++;
    }
  }
  console.log(`Successfully reset metadata for ${authResetCount} users in Supabase Auth.`);

  // 4. Verify Final State
  const { count: totalAfter } = await supabase.from('users').select('*', { count: 'exact', head: true });
  const { count: verifiedAfter } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('emailVerified', true);
  const { count: falseAfter } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('emailVerified', false);
  const { count: notNullDateAfter } = await supabase.from('users').select('*', { count: 'exact', head: true }).not('emailVerifiedAt', 'is', null);

  console.log('--- Final Report ---');
  console.log(`Total users after: ${totalAfter}`);
  console.log(`Users with emailVerified = true: ${verifiedAfter}`);
  console.log(`Users with emailVerified = false: ${falseAfter}`);
  console.log(`Users with emailVerifiedAt NOT NULL: ${notNullDateAfter}`);
  
  if (totalBefore === totalAfter) {
    console.log('Account count integrity confirmed: Unchanged.');
  } else {
    console.warn('WARNING: Account count changed!');
  }
}

runReset();
