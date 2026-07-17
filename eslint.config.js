const react = {
  rules: {
    "jsx-curly-brace-presence": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Disallow unnecessary JSX curly braces for string literals",
        },
        fixable: "code",
        schema: [
          {
            type: "object",
            properties: {
              props: { enum: ["always", "never"] },
              children: { enum: ["always", "never"] },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          unnecessaryCurlyProps: "Curly braces are unnecessary for a plain string prop value.",
          unnecessaryCurlyChildren: "Curly braces are unnecessary for plain string children.",
        },
      },
      create(context) {
        const options = {
          props: "never",
          children: "never",
          ...(context.options[0] || {}),
        };

        return {
          JSXAttribute(node) {
            if (options.props !== "never") return;

            const value = node.value;
            if (!value || value.type !== "JSXExpressionContainer") return;
            if (!value.expression || value.expression.type !== "Literal") {
              return;
            }
            if (typeof value.expression.value !== "string") return;

            context.report({
              node: value,
              messageId: "unnecessaryCurlyProps",
              fix(fixer) {
                const rawText = context.sourceCode.getText(value.expression);
                const quote = rawText.startsWith("'") ? "'" : '"';
                const escaped = String(value.expression.value).replaceAll(quote, `\\${quote}`);
                return fixer.replaceText(value, `${quote}${escaped}${quote}`);
              },
            });
          },

          JSXExpressionContainer(node) {
            if (options.children !== "never") return;

            if (!node.parent || node.parent.type !== "JSXElement") return;
            if (!node.expression || node.expression.type !== "Literal") return;
            if (typeof node.expression.value !== "string") return;

            context.report({
              node,
              messageId: "unnecessaryCurlyChildren",
              fix(fixer) {
                const rawText = context.sourceCode.getText(node.expression);
                if (rawText.startsWith('"') || rawText.startsWith("'") || rawText.startsWith("`")) {
                  return fixer.replaceText(node, node.expression.value);
                }
                return null;
              },
            });
          },
        };
      },
    },
  },
};

import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

const tsconfigRootDir = import.meta.dirname;
const recommendedTypeCheckedRules = Object.assign(
  {},
  ...tseslint.configs.recommendedTypeChecked.map((config) => config.rules ?? {}),
);

export default [
  {
    ignores: [".claude/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: "readonly",
        navigator: "readonly",
        document: "readonly",
        fetch: "readonly",
        HTMLElement: "readonly",
      },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      react,
      "react-hooks": reactHooks,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "no-undef": "error",
      "no-unused-vars": ["error", { varsIgnorePattern: "^React$|^[A-Z]" }],
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "func-style": ["error", "expression", { allowArrowFunctions: true }],
      "prefer-arrow-callback": ["error", { allowNamedFunctions: false }],
      "react/jsx-curly-brace-presence": [
        "error",
        {
          props: "never",
          children: "never",
        },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: {
          allowDefaultProject: [
            "vitest.config.ts",
            "netlify/functions/*.ts",
            "netlify/lib/*.ts",
            "netlify/tests/*.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
        },
        tsconfigRootDir,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...recommendedTypeCheckedRules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^React$|^[A-Z]", argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false, prefer: "type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "netlify/tests/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["src/router.tsx"],
    rules: {
      "@typescript-eslint/only-throw-error": "off",
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Default exports are not allowed. Use named exports instead.",
        },
      ],
    },
  },
];
