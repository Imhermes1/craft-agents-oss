/**
 * afterPack hook for electron-builder
 * Runs after app is packaged but before .dmg/.zip is created
 */
module.exports = async function afterPack(context) {
  console.log('afterPack: Skipping icon compilation (not needed for basic build)');
  return Promise.resolve();
};
