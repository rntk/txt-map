/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  reporters: ["clear-text", "progress", "html"],
  mutate: [
    "src/**/*.{js,jsx}",
    "!src/**/*.test.{js,jsx}",
    "!src/setupTests.js",
    "!src/main.jsx",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 60,
  },
  vitest: {
    configFile: "vite.config.mjs",
    related: true,
  },
};
