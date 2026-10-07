import next from "eslint-config-next";

export default [...next, { ignores: [".next/**", ".next-e2e/**", "drizzle/**", "coverage/**", "test-results/**"] }];
