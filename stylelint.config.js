import rawColorBaseline from "./.stylelint-raw-colors.json" with { type: "json" };
import noNewRawColors from "./scripts/stylelint-no-new-raw-colors.js";

export default {
  plugins: [noNewRawColors],
  rules: {
    "atomic/no-new-raw-colors": [true, { baseline: rawColorBaseline }],
    "color-no-invalid-hex": true,
  },
};
