/**
 * Remotion Configuration for Webify 16s Kinetic Reels
 * Vertical 9:16 (1080x1920) at 30fps
 */
const { Config } = require('@remotion/cli/config');

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('egl');
