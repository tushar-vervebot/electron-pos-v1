/**
 * build-msi.js
 * Standalone MSI build script that uses electron-wix-msi directly.
 * Run AFTER `npm run package` has produced the app folder in out/.
 *
 * Usage: node build-msi.js
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const { MSICreator } = require('electron-wix-msi');

const ROOT   = __dirname;
const wixDir = path.join(ROOT, 'tools', 'wix');

// ── 1. Add portable WiX to PATH so detect-wix.js can find candle/light ───────
if (!process.env.PATH.includes(wixDir)) {
  process.env.PATH = `${wixDir};${process.env.PATH}`;
}

// ── (Reserved for future spawn customisation) ─────────────────────────────

// ── 3. Locate the packaged app ────────────────────────────────────────────────
const appDir = path.join(ROOT, 'out', 'POS System-win32-x64');
if (!fs.existsSync(appDir)) {
  console.error(`\nApp folder not found: ${appDir}`);
  console.error('Run "npm run package" first, then run this script.\n');
  process.exit(1);
}

const outputRoot = path.join(ROOT, 'out', 'make', 'wix', 'x64');
const runStamp = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 17);
const outputDir = path.join(outputRoot, `build-${runStamp}`);
fs.mkdirSync(outputDir, { recursive: true });

// ── 4. Build the MSI ──────────────────────────────────────────────────────────
// NOTE: Service registration is handled by native WiX ServiceInstall entries
//       injected into the generated WXS.
async function main() {
  console.log('\n=== POS System MSI Builder ===');
  console.log(`App dir  : ${appDir}`);
  console.log(`Output   : ${outputDir}`);
  console.log(`WiX dir  : ${wixDir}\n`);

  const creator = new MSICreator({
    appDirectory:        appDir,
    outputDirectory:     outputDir,
    author:              'Your Company Name',
    description:         'Point of Sale System for Windows',
    exe:                 'pos-system',
    name:                'POS System',
    manufacturer:        'Your Company Name',
    version:             '1.0.0',
    upgradeCode:         'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
    language:            1033,
    shortcutFolderName:  'POS System',
    programFilesFolderName: 'POS System',
    icon:                path.join(ROOT, 'assets', 'icon.ico'),
    ui: { chooseDirectory: true },
  });

  // ── Fix: WixUtilExtension.dll is only in the full WiX installer (not portable).
  // Remove util: namespace usage from the template and prevent the extension
  // from being passed to candle (which would fail trying to load it from the GAC).
  // WixUIExtension IS available in portable WiX - use its full path.
  const wixUIDll = path.join(wixDir, 'WixUIExtension.dll');

  // Remove xmlns:util namespace and the util:RemoveFolderEx element from template
  creator.wixTemplate = creator.wixTemplate
    .replace(/\s*xmlns:util="[^"]*"/g, '')
    .replace(/<util:RemoveFolderEx[^/]*\/>/g, '');

  // Override creator.extensions so WixUI uses its full path (works with portable)
  // and WixUtil is skipped entirely (not available in portable binaries)
  const extArr = [wixUIDll];
  const _origFind = Array.prototype.find;
  Object.defineProperty(extArr, 'find', {
    value: function (fn) {
      if (fn('WixUIExtension'))   return wixUIDll;
      if (fn('WixUtilExtension')) return {};
      return _origFind.call(this, fn);
    },
  });
  creator.extensions = extArr;

  console.log('Generating WiX source files...');
  const { wxsFile } = await creator.create();
  console.log(`WXS file : ${wxsFile}`);

  // ── Inject WiX ServiceInstall + ServiceControl ────────────────────────────
  // electron-wix-msi auto-generates a <Component> + <File> entry for every
  // file in the package.  We find the File element for pos-health-service.exe
  // (the pkg-bundled standalone service exe) and insert native WiX service
  // elements after it.  WiX's MSI engine calls CreateService / StartService
  // directly — no custom action, no PowerShell, no PATH lookup required.
  console.log('Injecting ServiceInstall into WXS...');
  let wxsContent = fs.readFileSync(wxsFile, 'utf8');

  const svcXml =
    '\n        <ServiceInstall Id="POSHealthInstall"' +
    '\n          Name="POS_HealthService"' +
    '\n          DisplayName="POS Health Service"' +
    '\n          Description="POS System health check HTTP endpoint on localhost:5001"' +
    '\n          Type="ownProcess"' +
    '\n          Start="auto"' +
    '\n          ErrorControl="normal" />' +
    '\n        <ServiceControl Id="POSHealthStart"' +
    '\n          Name="POS_HealthService"' +
    '\n          Start="install"' +
    '\n          Stop="both"' +
    '\n          Remove="uninstall"' +
    '\n          Wait="no" />';

  // Match any <File .../> whose Source attribute ends with POS_HealthService.exe (WinSW)
  // WinSW properly registers with Windows SCM and wraps pos-health-service.exe.
  const wxsPatched = wxsContent.replace(
    /(<File\s[^>]*Source="[^"]*POS_HealthService\.exe"[^>]*\/>)/i,
    `$1${svcXml}`
  );

  if (wxsPatched === wxsContent) {
    console.error('\n  ERROR: POS_HealthService.exe not found in the WXS.');
    console.error('  Ensure src/services/pos-health/POS_HealthService.exe exists and re-run "npm run make:msi".\n');
    process.exit(1);
  }

  fs.writeFileSync(wxsFile, wxsPatched, 'utf8');
  console.log('  ServiceInstall injected successfully.');

  // Copy WiX extension DLLs to the compilation CWD.
  // WiX resolves "-ext WixUtilExtension" relative to the CWD when the DLL
  // is not in the GAC (portable binaries aren't registered in the GAC).
  const compileDir = path.dirname(wxsFile);
  for (const dll of ['WixUIExtension.dll', 'WixUtilExtension.dll']) {
    const src = path.join(wixDir, dll);
    const dst = path.join(compileDir, dll);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      console.log(`Copied ${dll} → compile dir`);
    }
  }

  console.log('Compiling MSI (candle + light)...');
  await creator.compile();

  const msiFile = path.join(outputDir, 'pos-system.msi');
  const msiAlt  = path.join(outputDir, 'POS System.msi');
  const found   = fs.existsSync(msiFile) ? msiFile : fs.existsSync(msiAlt) ? msiAlt : null;

  if (found) {
    const sizeMB = (fs.statSync(found).size / 1024 / 1024).toFixed(1);

    // Best-effort convenience copy to a stable "latest" path.
    // If that file is locked, we still keep the timestamped MSI as valid output.
    const latestDir = path.join(outputRoot, 'latest');
    const latestMsi = path.join(latestDir, 'pos-system.msi');
    fs.mkdirSync(latestDir, { recursive: true });
    try {
      fs.copyFileSync(found, latestMsi);
    } catch (copyErr) {
      console.warn(`  Warning: could not update latest MSI copy (${copyErr.message})`);
    }

    console.log(`\n✔ MSI built successfully!`);
    console.log(`  File : ${found}`);
    console.log(`  Latest copy : ${latestMsi}`);
    console.log(`  Size : ${sizeMB} MB\n`);
  } else {
    console.log(`\n✔ Build finished. Check ${outputDir} for the .msi file.\n`);
  }
}

main().catch(err => {
  console.error('\n✖ MSI build failed:', err.message || err);
  process.exit(1);
});
