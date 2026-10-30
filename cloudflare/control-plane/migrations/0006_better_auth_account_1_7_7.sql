-- Better Auth 1.7.3+ stopped writing account.issuer. Preserve existing values
-- while making the column nullable; never rewrite deployed migration 0001.
-- Before production rollout, back up D1 and check duplicate (providerId,accountId)
-- pairs, which the new Better Auth identity selector must uniquely identify.
-- The migration must run before the upgraded Worker serves authentication.
CREATE TABLE "account_1_7_7" (
  "id" text not null primary key,
  "issuer" text,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date not null,
  "updatedAt" date not null
);
INSERT INTO "account_1_7_7" (
  "id", "issuer", "accountId", "providerId", "userId", "accessToken",
  "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt",
  "scope", "password", "createdAt", "updatedAt"
)
SELECT
  "id", "issuer", "accountId", "providerId", "userId", "accessToken",
  "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt",
  "scope", "password", "createdAt", "updatedAt"
FROM "account";
-- Validate uniqueness before removing the original table; refuse ambiguous accounts.
CREATE UNIQUE INDEX "account_providerId_accountId_uidx" ON "account_1_7_7" ("providerId", "accountId");
DROP TABLE "account";
ALTER TABLE "account_1_7_7" RENAME TO "account";
CREATE INDEX "account_userId_idx" ON "account" ("userId");
