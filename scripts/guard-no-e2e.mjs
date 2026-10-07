// `npm run build` produces the production bundle: it must never run with the test-double switch on.
if (process.env.E2E_BUILD) {
  console.error("E2E_BUILD is set: refusing to run a production build. Unset it (the Playwright build uses its own command).");
  process.exit(1);
}
