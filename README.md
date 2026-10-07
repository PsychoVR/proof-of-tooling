# Proof of Tooling

**A tool that counts the tools validators build. Including this one.**

An open, verifiable directory of the tools Solana validators build: explorers, monitors, dashboards, clients and ops scripts. Each tool is claimed with a signature from the validator's identity key plus a proof file in the tool's repo or website, so nobody can list a tool under someone else's name.

Live at [tooling.sunshinevr.io](https://tooling.sunshinevr.io). Built by [SunshineVR](https://sunshinevr.io).

## How claiming works

1. Add `.proof-of-tooling.json` to the root of your repo (or `/.well-known/proof-of-tooling.json` on your site):

   ```json
   { "identities": ["<your validator identity pubkey>"] }
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
4. Run the migrations against the production database (`npm run db:migrate` with the production `DATABASE_URL`).
5. hPanel → **Advanced → Cron Jobs**, every 15 minutes:
   `curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" https://tooling.sunshinevr.io/api/cron/ping`

Check: `GET /api/health` returns `"db": true`, and `lastHeartbeat` advances on its own.

## License

MIT
