import baseConfig from "./eslint.config.mjs";

export default [
  ...baseConfig,
  {
    files: ["src/**/*.{js,jsx}"],
    rules: {
      complexity: ["error", { max: 10 }],
      "max-depth": ["error", 4],
      "max-lines-per-function": [
        "error",
        {
          max: 120,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-nested-callbacks": ["error", 4],
      "max-params": ["error", 4],
      "max-statements": ["error", 40],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^(React|_)" },
      ],
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
