import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Better Auth 1.7.7 account schema migration", () => {
  it("accepts new accounts without issuer while preserving legacy issuer rows and provider identity uniqueness", async () => {
    const cols = await env.DB.prepare('PRAGMA table_info("account")').all<{ name: string; notnull: number }>();
    expect(cols.results.find((col) => col.name === "issuer")?.notnull).toBe(0);

    await env.DB.prepare(
      'INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    ).bind("schema-user", "Schema Test", "schema@example.test", 0, 1, 1).run();
    const addAccount = env.DB.prepare(
      'INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    );
    await addAccount.bind("schema-account-new", "new-provider-subject", "github", "schema-user", 1, 1).run();
    await env.DB.prepare(
      'INSERT INTO "account" ("id", "issuer", "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind("schema-account-old", "old-issuer", "old-provider-subject", "github", "schema-user", 1, 1).run();

    const newAccount = await env.DB.prepare('SELECT "issuer" FROM "account" WHERE "id" = ?').bind("schema-account-new").first<{ issuer: string | null }>();
    const oldAccount = await env.DB.prepare('SELECT "issuer" FROM "account" WHERE "id" = ?').bind("schema-account-old").first<{ issuer: string | null }>();
    expect(newAccount?.issuer).toBeNull();
    expect(oldAccount?.issuer).toBe("old-issuer");
    await expect(addAccount.bind("schema-account-duplicate", "old-provider-subject", "github", "schema-user", 1, 1).run()).rejects.toThrow();
  });
});
