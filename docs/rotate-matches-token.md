# Refresh matches token

## Trigger and scope

User shorthand: **“Refresh matches token.”** This includes Netlify production update, redeployment, and live verification. Also recognize **“Rotate the matches token and redeploy.”**

Renew the read-only Turso `matches` database token, update the production Netlify secret, deploy, and verify live database reads. Do not change the openings database, database contents, local environment files, or unrelated Netlify settings.

Here, “rotate” means issue and deploy a replacement token. It does **not** imply revoking existing tokens. Do not invalidate other clients or revoke tokens without a separate explicit request and impact review.

## Known configuration — verify before writing

- Turso user: `richardm7`; database: `matches`.
- Database URL: `libsql://matches-richardm7.aws-us-east-2.turso.io`.
- Netlify site: `atomic-puzzles`; production URL: `https://atomicpuzzles.org`.
- Site ID: `d856e0ef-3151-48e7-8bff-c6a80bfa782f`.
- Account ID: `69c5d65d456bd6a6222e103b`.
- Linked repository: `https://github.com/richardm213/atomic-puzzles`; production branch: `main`.
- Secret key: `TURSO_MATCHES_AUTH_TOKEN`.
- URL key: `TURSO_MATCHES_DATABASE_URL`.
- Server consumer: `netlify/archive/client.ts`; verification routes: `netlify/functions/archive-data.ts` and `netlify/archive/queries.ts`.

These identifiers were verified on September 12, 2026. Re-discover them if the account or site configuration changes.

## Procedure

1. **Check authentication and target.**
   - Run `turso auth whoami` and `turso db list`. The CLI may be at `$HOME/.turso/turso`.
   - Reuse existing authentication; if expired, start the supported login flow and let the user complete authentication. Never ask for passwords or tokens in chat.
   - Reuse Netlify CLI authentication when available. On this Mac, its config was at `$HOME/Library/Preferences/netlify/config.json`; the token is under `users[userId].auth.token`. Read it only inside the process making authorized Netlify calls; never dump the config.
   - Query Netlify site details and verify the repository, account, production branch, and database URL. Inspect secret scopes and contexts without logging values.

2. **Generate and validate one replacement token.**
   - Capture the output of `turso db tokens create matches --read-only` directly in process memory, never terminal output.
   - The CLI's observed expiration default was `never`. Check current help; honor any user-specified expiration and do not invent a short expiration without a renewal plan.
   - Use `@libsql/client` with the verified matches URL and new token to execute `SELECT 1`, then close the client.
   - Keep the same new token in memory for any update retries; avoid generating additional tokens unnecessarily.

3. **Update only the production secret value.**
   - Use Netlify's single-value endpoint:
     `PATCH https://api.netlify.com/api/v1/accounts/{account_id}/env/TURSO_MATCHES_AUTH_TOKEN?site_id={site_id}`
   - Send JSON `{ "context": "production", "value": "<new token held in memory>" }` with the existing Netlify bearer credential.
   - Preserve `is_secret: true`, scopes, and non-production values. Do not replace the entire environment-variable collection or change the database URL.
   - Read the variable metadata back via `GET` on the same endpoint. Verify the production context, secret flag, scopes, and update timestamp. Secret read-back values are masked; do not claim a byte-for-byte comparison.
   - Known API pitfall: this site's legacy `all` context returned HTTP 422, `context can't be set to all`, on both whole-variable and single-value updates. Updating `production` succeeded; Netlify normalized the legacy fallback into explicit `dev`, `branch-deploy`, `deploy-preview`, and `production` contexts. Do not retry `all` blindly or disable secret protection to bypass this.

4. **Redeploy as part of the refresh.**
   - “Refresh matches token” includes deployment authorization; do not ask for a second confirmation. If the user explicitly requests a token-only update or says not to deploy, save the secret without deploying and report that activation is pending.
   - Record the current published deployment ID and commit, then trigger one production build:
     `POST https://api.netlify.com/api/v1/sites/{site_id}/builds` with JSON `{}`.
   - This builds the linked production branch, including its current committed changes; it does not upload the local working tree. If unrelated pending changes are identified, surface that before deployment.
   - Record the returned `deploy_id`. Poll `GET /api/v1/deploys/{deploy_id}` at reasonable intervals until `ready` or `error`, using a bounded wait. Do not trigger duplicate builds on an uncertain response; inspect existing builds first.

5. **Verify production.**
   - Confirm the deployment is published, not merely queued or built.
   - Fetch both live routes with a unique cache-busting query parameter and `Cache-Control: no-cache`:
     - `/api/archive-data?resource=health`: expect HTTP 200 and `ok: true`.
     - `/api/archive-data?resource=latest_match`: expect HTTP 200 and a valid `start_ts` field.
   - Both routes execute actual database reads. Report any build or API failure honestly; do not claim the token is active until deployment and live checks pass.

## Security and failure handling

- Never put either token in chat, source files, URLs, shell arguments, logs, or committed artifacts. Capture subprocess output and sanitize error responses before displaying them.
- Request the normal network permission escalation if sandbox networking blocks authorized calls; a DNS failure inside the sandbox does not prove the login expired.
- Do not revoke existing tokens, mutate database data, or change other environments as a repair attempt.
- If an update succeeds but deployment fails, report that the secret is saved but activation is unverified. Preserve the working deployment; do not promise rollback of a masked secret you cannot recover.
- This playbook contains no credentials and creates no recurring automation.

## Completion message

Keep it short: production deployment status, whether the new matches token is active, and the two live-check results. If only the environment was updated, explicitly say a redeploy is still needed.
