const { registerRoot } = require('remotion');
const { RemotionRoot } = require('./Root');

try {
  registerRoot(RemotionRoot);
} catch (e) {
  // registerRoot is used by remotion CLI runtime; ignore in normal node import
}

module.exports = { RemotionRoot };
