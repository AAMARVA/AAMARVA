-- Fix: Make E2EE columns nullable for public connection context messages
ALTER TABLE messages ALTER COLUMN ciphertext DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN nonce DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN "keyEpoch" DROP NOT NULL;
