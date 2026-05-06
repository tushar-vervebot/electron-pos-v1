const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

// ── Portable WiX v3 binaries (no system install needed) ──────────────────────
const wixDir = path.join(__dirname, 'tools', 'wix');
if (!process.env.PATH.includes(wixDir)) {
  process.env.PATH = `${wixDir};${process.env.PATH}`;
}

// ── Patch electron-wix-msi to use full DLL paths for portable WiX ────────────
const spawnMod = require('./node_modules/electron-wix-msi/lib/utils/spawn');
const _origSpawn = spawnMod.spawnPromise;
spawnMod.spawnPromise = (binary, args, opts) => {
  const patched = args.map((arg, i) => {
    if (i > 0 && args[i - 1] === '-ext') {
      const dll = path.join(wixDir, arg + '.dll');
      return fs.existsSync(dll) ? dll : arg;
    }
    return arg;
  });
  return _origSpawn(binary, patched, opts);
};

module.exports = {
  packagerConfig: {
    name: 'POS System',
    executableName: 'pos-system',
    appVersion: '1.0.0',
    appCopyright: 'Copyright 2026 Your Company',
    icon: path.join(__dirname, 'assets', 'icon'),
    asar: true,
    extraResource: [
      path.join(__dirname, 'electron', 'services', 'pos-health'),
    ],
    ignore: [
      /^\/tools/,
      /^\/out/,
      /^\/\.git/,
      /^\/forge\.config\.js$/,
      /node_modules[\\/]\.bin/,
      /node_modules[\\/]electron$/,
      /\.map$/,
      /\.ts$/,
    ],
  },

  hooks: {
    // Build a standalone Windows service exe BEFORE Electron packages the app.
    // @yao-pkg/pkg bundles Node.js + service.js into one self-contained exe
    // that WiX ServiceInstall can register without needing node.exe on PATH.
    prePackage: async () => {
      const serviceJs  = path.join(__dirname, 'electron', 'services', 'pos-health', 'service.js');
      const serviceExe = path.join(__dirname, 'electron', 'services', 'pos-health', 'pos-health-service.exe');

      if (fs.existsSync(serviceExe)) {
        console.log('\n[Forge] pos-health-service.exe already built – skipping pkg step.\n');
        return;
      }

      console.log('\n[Forge] Building standalone service exe with pkg (first-time download ~50 MB)...');
      const pkgBin = path.join(__dirname, 'node_modules', '.bin', 'pkg');
      execSync(
        `"${pkgBin}" "${serviceJs}" --target node18-win-x64 --output "${serviceExe}"`,
        { stdio: 'inherit', shell: true, cwd: __dirname }
      );
      console.log('[Forge] pos-health-service.exe ready.\n');
    },
  },

  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-wix',
      config: {
        upgradeCode: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        name: 'POS System',
        shortName: 'POSSystem',
        manufacturer: 'Your Company Name',
        description: 'Point of Sale System for Windows',
        language: 1033,
        version: '1.0.0',
        shortcutFolderName: 'POS System',
        programFilesFolderName: 'POS System',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        ui: { chooseDirectory: true },
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
