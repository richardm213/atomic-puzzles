import path from "node:path";
import process from "node:process";

import stylelint from "stylelint";

const ruleName = "atomic/no-new-raw-colors";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (color) =>
    `Unexpected raw color ${color}. Add a semantic token in src/theme and reference it with var().`,
});

const normalizePath = (filePath) =>
  path.relative(process.cwd(), filePath).split(path.sep).join("/");

const rule = (enabled, options = {}) => {
  return (root, result) => {
    if (!enabled || !root.source?.input.file) return;

    const sourcePath = normalizePath(root.source.input.file);
    if (sourcePath.startsWith("src/theme/")) return;

    const allowedColors = new Set(
      (options.baseline?.[sourcePath] ?? []).map((color) => color.toLowerCase()),
    );

    root.walkDecls((declaration) => {
      const rawColors = declaration.value.match(/#[\da-f]{3,8}\b/gi) ?? [];
      for (const rawColor of rawColors) {
        if (allowedColors.has(rawColor.toLowerCase())) continue;

        stylelint.utils.report({
          ruleName,
          result,
          node: declaration,
          word: rawColor,
          message: messages.rejected(rawColor),
        });
      }
    });
  };
};

rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
