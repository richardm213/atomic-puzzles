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

const reactHooks = {
  rules: {
    "rules-of-hooks": {
      meta: {
        type: "problem",
        docs: {
          description: "Enforce React hooks to be called at the top level",
        },
        schema: [],
        messages: {
          conditionalHook:
            "React Hook '{{name}}' cannot be called inside conditional or loop blocks.",
        },
      },
      create(context) {
        const disallowedAncestors = new Set([
          "IfStatement",
          "ConditionalExpression",
          "SwitchStatement",
          "SwitchCase",
          "ForStatement",
          "ForInStatement",
          "ForOfStatement",
          "WhileStatement",
          "DoWhileStatement",
          "TryStatement",
          "CatchClause",
        ]);

        return {
          CallExpression(node) {
            if (node.callee.type !== "Identifier") return;

            const hookName = node.callee.name;
            if (!/^use[A-Z0-9]/.test(hookName)) return;

            const ancestors = context.sourceCode.getAncestors(node);
            const isInDisallowedBlock = ancestors.some((ancestor) =>
              disallowedAncestors.has(ancestor.type),
            );

            if (isInDisallowedBlock) {
              context.report({
                node,
                messageId: "conditionalHook",
                data: { name: hookName },
              });
            }
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx}"],
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
        document: "readonly",
        fetch: "readonly",
        HTMLElement: "readonly",
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
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
    },
  },
  {
    files: ["src/**/*.{js,jsx}"],
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
