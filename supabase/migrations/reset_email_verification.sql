-- Explicitly reset all existing AAMARVA accounts to an unverified state as part of audit onboarding
-- Resetting both the verified boolean and its corresponding validation timestamp
UPDATE users
SET "emailVerified" = FALSE,
    "emailVerifiedAt" = NULL;
