'use strict';

const path = require('path');
const rcedit = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );
  const iconPath = path.resolve(__dirname, '..', 'assets', 'icon.ico');

  await rcedit(exePath, {
    icon: iconPath,
  });
};
