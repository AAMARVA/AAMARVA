
const bcrypt = require('bcryptjs');

async function testPassword() {
  const password = 'kd';
  const hash = '$2b$12$ejFAoX8LthswmcA8GhUX3elUx9Yet4VRypuvZAkYv8fkatXGdJU3G';
  const isMatch = await bcrypt.compare(password, hash);
  console.log('Password match:', isMatch);
}
testPassword();
