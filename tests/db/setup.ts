try {
  process.loadEnvFile(".env");
} catch {
  // CI may provide the variables directly
}
