# Better Auth 1.7.7 D1 upgrade gate

The original migration `0001_better_auth_1_7_1.sql` includes a mandatory
`account.issuer` field. Better Auth 1.7.3+ no longer writes this field.
Never modify the already-deployed `0001` migration; instead apply additive
`0006_better_auth_account_1_7_7.sql` before serving auth requests on 1.7.7.

## Production preflight (NOT executed)

1. Back up the D1 database; test recovery on a disposable restored copy.
2. Pause authentication and background account writes.
3. Run this read-only duplicate identity check. It must return no rows:

```sql
SELECT providerId, accountId, COUNT(*) AS duplicate_count
FROM account
GROUP BY providerId, accountId
HAVING COUNT(*) > 1;
```

If any rows appear, stop and reconcile identity ownership manually.
Never merge different users. The migration intentionally creates its new
unique provider/account index **before** removing the old account table;
it fails safely on duplicate identities.

4. Review/run `0006` on a restored D1 copy and confirm account counts,
   historical issuer data, and `PRAGMA foreign_key_check` (no errors).
5. Coordinate migration and Worker rollout in one controlled maintenance
   window. Verify email OTP, bearer sign-in, existing accounts and account
   linking before resuming traffic.
6. Do not roll back merely by downgrading Better Auth: new rows may have
   null issuer values that are incompatible with 1.7.1. Use a tested,
   coordinated database-and-application recovery plan.

No live D1 migration or deployment is part of the security PR. See the
[Better Auth 1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide)
for provider-specific account identity changes.
