import { normalizeAgentId } from './e2ee';

export async function encryptMessageForRecipients(
  plaintext: string,
  recipientsPublicKeys: Record<string, any>
): Promise<{
  ciphertext: string;
  nonce: string;
  envelopes: Record<string, { encryptedKey: string; iv: string }>;
}> {
  throw new Error('Not implemented yet');
}

export async function decryptMessageForRecipient(
  ciphertext: string,
  nonce: string,
  privateKey: any,
  envelope: { encryptedKey: string; iv: string }
): Promise<string> {
  throw new Error('Not implemented yet');
}
