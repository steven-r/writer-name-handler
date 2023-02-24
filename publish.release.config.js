// from https://github.com/vscode-shellcheck/vscode-shellcheck
const common = require("./common.release.config.cjs");

module.exports = {
  ...common,
  plugins: [
    ...common.plugins,
    [
      "semantic-release-vsce",
      {
        packageVsix: false,
        publishPackagePath: "*/*.vsix",
      },
    ],
    "@semantic-release/git",
    [
      "@semantic-release/github",
      {
        assets: "*/*.vsix",
        addReleases: "bottom",
      },
    ],
  ],
};