# Proof of Tooling

**A tool that counts the tools validators build. Including this one.**

An open, verifiable directory of the tools Solana validators build: explorers, monitors, dashboards, clients and ops scripts. Each tool is claimed with a signature from the validator's identity key plus a proof file in the tool's repo or website, so nobody can list a tool under someone else's name.

Live at [tooling.sunshinevr.io](https://tooling.sunshinevr.io). Built by [SunshineVR](https://sunshinevr.io).

## How claiming works

1. Prove you own the tool. The proof lists your validator identity pubkey and is checked on every claim and again periodically, so keep it in place.

   **GitHub repos.** Add `.proof-of-tooling.json` to the root of the repo's default branch:

   ```json
   { "identities": ["<your validator identity pubkey>"] }
   ```

   To cover all your repos at once, put the same file in `github.com/<owner>/.github` or in your profile repo `github.com/<owner>/<owner>`. Only the owner named in the claimed URL is consulted. The repo's own file is checked first. Claims proved only by an account-level file are never approved automatically: they wait for a manual review.

   **Websites.** Any one of these is enough. Each is valid only for the exact host you claim (`tool.example.com` does not cover `example.com` or `other.example.com`), and bare shared suffixes such as `vercel.app` or `github.io` are not supported, while `you.vercel.app` is.

   - A file at `https://<host>/.well-known/proof-of-tooling.json` with the same JSON as above.
   - A DNS TXT record on `<host>` with the value `proof-of-tooling=<your validator identity pubkey>`.
   - A tag inside the `<head>` of `https://<host>/`:

     ```html
     <meta name="proof-of-tooling" content="<your validator identity pubkey>">
     ```

2. Sign the claim line with your identity key:

   ```bash
   solana sign-offchain-message -k <identity-keypair.json> \
     "proof-of-tooling v1 | claim | github.com/you/your-tool | <identity pubkey> | YYYY-MM-DD"
   ```

3. Paste the signature on the site. It is verified against Solana's off-chain message format and your live vote account.

The full registry, with every message and signature, is public and can be re-verified by anyone.

## Status

Early development. The claim flow above describes the planned v1 protocol.

## Development

```bash
npm install
cp .env.example .env    # fill in DATABASE_URL and CRON_SECRET
npm run db:migrate
npm run dev
```

Other scripts: `npm run build`, `npm run test`, `npm run lint`, `npm run db:generate`.

## Deploy on Hostinger

1. hPanel → **Websites** → **Create a website** → **Node.js web app** → import this repo from GitHub, branch `main`, Node.js 22.x. The build uses webpack (`next build --webpack`); Turbopack fails in Hostinger's build environment.
2. hPanel → **Databases** → create a MySQL database and user.
3. In the app → **Environment variables**: `DATABASE_URL=mysql://user:password@host:3306/database` and `CRON_SECRET=<long random string>`. Redeploy.
4. After every deploy, run the migrations: `curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://tooling.sunshinevr.io/api/cron/migrate` (returns the migrations it applied).
5. hPanel → **Advanced → Cron Jobs**, every 15 minutes:
   `curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" https://tooling.sunshinevr.io/api/cron/ping`

Check: `GET /api/health` returns `"db": true`, and `lastHeartbeat` advances on its own.

### Client IP and rate limiting

Rate limits are keyed by client IP. The first `X-Forwarded-For` value is client-controlled and is never trusted. Pick one of the options below depending on what your proxy sets:

- `TRUSTED_IP_HEADER=x-real-ip` (or whichever header your proxy sets with the real client address). Used when it holds a valid IP.
- `TRUSTED_PROXY_HOPS=<n>` (default `1`): number of trusted proxies in front of the app. The client IP is the `X-Forwarded-For` entry that many positions from the right.

Per-IP limits only block once one of these two variables is set. Until then they run in log-only mode: requests are counted and a would-be block is logged, but never refused, so a first deploy cannot lock anyone out. To pick the header, call `GET /api/admin/debug/ip` with `Authorization: Bearer $ADMIN_SECRET`: it echoes `x-forwarded-for`, `x-real-ip`, `forwarded`, `cf-connecting-ip` and `x-client-ip` as the proxy delivered them (nothing is stored). Per-identity limits are not affected.

If the IP cannot be determined, the request falls into a single shared bucket with a stricter limit. Claim requests are additionally limited per claimed identity.

## License

MIT
