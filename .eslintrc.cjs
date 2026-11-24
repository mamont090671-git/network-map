{
  "env": {
    "browser": true,
    "es2024": true,
    "node": true
  },
  "extends": ["eslint:recommended", "prettier"],
  "parserOptions": {
    "ecmaVersion": 2024,
    "sourceType": "module"
  },
  "rules": {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": "warn",
    "curly": "error"
  },
  "ignorePatterns": ["node_modules/", "dist/", "*.log"]
}
