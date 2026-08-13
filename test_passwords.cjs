const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkPasswords() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase.from('users').select('id, "passwordHash"');
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  let plaintextFound = false;
  let plaintextLocations = [];

  for (const user of data) {
    const pw = user.passwordHash;
    if (pw && !pw.startsWith('$2') && !pw.startsWith('$argon2')) {
      plaintextFound = true;
      plaintextLocations.push(user.id);
      console.log(`User ${user.id} has a non-bcrypt password: ${pw.substring(0, 5)}...`);
    }
  }

  if (plaintextFound) {
    console.log("Found plaintext passwords!");
  } else {
    console.log("No plaintext passwords found in passwordHash column.");
  }
}
checkPasswords();
