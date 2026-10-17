
import { generateE2EEKeyPair } from '../../src/lib/e2ee';
import { encryptMessageForRecipients, decryptMessageForRecipient } from '../../src/lib/clusterCrypto';

export async function runClusterMessagingSecurityTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA CLUSTER MESSAGING SECURITY RECIPIENT MODEL SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  try {
    // Test 1: Encryption and Decryption by Authorized Recipient
    const ownerPair = await generateE2EEKeyPair();
    const recipientAPair = await generateE2EEKeyPair();
    const recipientBPair = await generateE2EEKeyPair();
    
    const plaintext = 'Secret message';
    const clusterId = 'test-cluster';
    
    const recipients = {
      'AMR-A': recipientAPair.publicKey,
      'AMR-B': recipientBPair.publicKey
    };
    
    const envelope = await encryptMessageForRecipients(
      plaintext,
      recipients,
      ownerPair.privateKey,
      'AMR-OWNER',
      clusterId
    );
    
    const decryptedA = await decryptMessageForRecipient(
      envelope.ciphertext,
      envelope.nonce,
      recipientAPair.privateKey,
      envelope.keys,
      ownerPair.publicKey,
      'AMR-A',
      clusterId,
      'AMR-OWNER'
    );
    
    recordResult('test_recipient_decryption_success', decryptedA === plaintext, 'Authorized recipient decrypted correctly');

    // Test 2: Unauthorized Recipient Rejection
    const intruderPair = await generateE2EEKeyPair();
    let intruderFailed = false;
    try {
      await decryptMessageForRecipient(
        envelope.ciphertext,
        envelope.nonce,
        intruderPair.privateKey,
        envelope.keys,
        ownerPair.publicKey,
        'AMR-INTRUDER',
        clusterId,
        'AMR-OWNER'
      );
    } catch (e) {
      intruderFailed = true;
    }
    recordResult('test_unauthorized_recipient_rejection', intruderFailed, 'Unauthorized recipient rejected');

  } catch (err: any) {
    console.error('Test suite error:', err);
    recordResult('Test Suite Execution', false, err?.message);
  }

  return results;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('clusterMessagingSecurityTests')) {
  runClusterMessagingSecurityTests().then(results => {
    const hasFailures = Object.values(results).some(r => r.status === 'FAILED');
    if (hasFailures) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
