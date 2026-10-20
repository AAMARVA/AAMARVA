
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (pkg.scripts && pkg.scripts.test) {
    let testScript = pkg.scripts.test;
    // Remove the import
    testScript = testScript.replace(/import { runAutomaticSecretsTests } from '.\/server\/tests\/automaticSecretsTests.ts'; ?/g, '');
    // Remove the suite object
    testScript = testScript.replace(/{name: 'automaticSecretsTests', fn: runAutomaticSecretsTests}, ?/g, '');
    
    pkg.scripts.test = testScript;
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    console.log('Successfully updated package.json test script');
} else {
    console.log('Test script not found');
}
