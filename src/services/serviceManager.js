'use strict';
/**
 * serviceManager.js
 * Called from main.js on first launch (packaged builds only).
 * Writes WinSW XML with correct absolute paths then installs and starts
 * POS_HealthService using WinSW — elevated via a UAC prompt.
 */

const path  = require('path');
const fs    = require('fs');
const { execSync, spawn } = require('child_process');

const SERVICE_NAME = 'POS_HealthService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isServiceInstalled() {
  try {
    execSync(`sc.exe query "${SERVICE_NAME}"`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function findNodeExe() {
  const candidates = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const raw = execSync('where.exe node', { encoding: 'utf8', timeout: 5000 });
    const found = raw.trim().split(/\r?\n/).map(l => l.trim()).find(l => l && fs.existsSync(l));
    if (found) return found;
  } catch { /* ignore */ }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Installs and starts POS_HealthService if it doesn't already exist.
 * @param {string} resourcesPath - value of process.resourcesPath
 * @param {Electron.BrowserWindow} [win] - optional parent window for dialog
 * @returns {Promise<{success: boolean, alreadyInstalled?: boolean, error?: string}>}
 */
async function installHealthService(resourcesPath, win) {
  if (isServiceInstalled()) {
    console.log('[ServiceManager] POS_HealthService already installed.');
    return { success: true, alreadyInstalled: true };
  }

  const winswDir  = path.join(resourcesPath, 'pos-health');
  const winswExe  = path.join(winswDir, 'POS_HealthService.exe');
  const serviceJs = path.join(winswDir, 'service.js');

  if (!fs.existsSync(winswExe) || !fs.existsSync(serviceJs)) {
    const msg = `Service files not found in: ${winswDir}`;
    console.error('[ServiceManager]', msg);
    return { success: false, error: msg };
  }

  const nodeExe = findNodeExe();
  if (!nodeExe) {
    const msg = 'Node.js not found. Please install Node.js from https://nodejs.org';
    console.error('[ServiceManager]', msg);
    return { success: false, error: msg };
  }

  // ── Create directories ────────────────────────────────────────────────────
  const logDir   = path.join(process.env.ProgramData || 'C:\\ProgramData', 'POS System', 'logs');
  const setupDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'POS System', 'setup');
  fs.mkdirSync(logDir,   { recursive: true });
  fs.mkdirSync(setupDir, { recursive: true });

  // ── Write WinSW XML config ────────────────────────────────────────────────
  // WinSW reads this XML on startup to know what process to wrap.
  // We write it here so all paths are absolute and correct.
  const xmlPath = path.join(winswDir, 'POS_HealthService.xml');
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<service>
  <id>${SERVICE_NAME}</id>
  <name>POS Health Service</name>
  <description>POS System health check HTTP endpoint on localhost:5001</description>
  <executable>${nodeExe}</executable>
  <arguments>"${serviceJs}"</arguments>
  <startmode>Automatic</startmode>
  <logpath>${logDir}</logpath>
  <logname>pos-health-winsw</logname>
</service>`;

  try {
    fs.writeFileSync(xmlPath, xmlContent, 'utf8');
    console.log('[ServiceManager] WinSW XML written to', xmlPath);
  } catch (err) {
    return { success: false, error: `Failed to write WinSW XML: ${err.message}` };
  }

  // ── Write elevated setup script ───────────────────────────────────────────
  // Using a temp .ps1 avoids all nested-quoting nightmares.
  // Path uses ProgramData which is C:\ProgramData (no spaces on most systems).
  const setupScript = path.join(setupDir, 'setup-pos-health.ps1');
  const winswEscaped  = winswExe.replace(/'/g, "''");   // PS single-quote escape
  const logFileEscaped = path.join(logDir, 'service-setup.log').replace(/'/g, "''");

  const psContent = [
    `$winsw   = '${winswEscaped}'`,
    `$logFile = '${logFileEscaped}'`,
    `function Log($m) { "[$(Get-Date -f 'yyyy-MM-dd HH:mm:ss')] $m" | Add-Content $logFile }`,
    `Log 'POS_HealthService setup started'`,
    `Log "WinSW: $winsw"`,
    `$r = & $winsw install 2>&1; Log "install -> $r"`,
    `Start-Sleep -Seconds 2`,
    `$r = & $winsw start 2>&1; Log "start -> $r"`,
    `Log 'Done'`,
  ].join('\r\n');

  try {
    fs.writeFileSync(setupScript, psContent, 'utf8');
    console.log('[ServiceManager] Setup script written to', setupScript);
  } catch (err) {
    return { success: false, error: `Failed to write setup script: ${err.message}` };
  }

  // ── Show UAC dialog ───────────────────────────────────────────────────────
  if (win) {
    const { dialog } = require('electron');
    await dialog.showMessageBox(win, {
      type:    'info',
      title:   'POS System — Service Setup',
      message: 'Installing POS Health Service',
      detail:  'Windows will ask for administrator permission. Click Yes to allow.\n\nThis only happens once.',
      buttons: ['OK'],
    });
  }

  // ── Run script elevated (triggers UAC) ────────────────────────────────────
  // Outer powershell runs as the current user; Start-Process -Verb RunAs
  // triggers the UAC dialog so the inner script runs as Administrator.
  const setupScriptEscaped = setupScript.replace(/'/g, "''");
  const elevateCmd = `Start-Process powershell.exe -Verb RunAs -Wait ` +
    `-ArgumentList @('-NonInteractive','-ExecutionPolicy','Bypass','-File','${setupScriptEscaped}')`;

  console.log('[ServiceManager] Requesting elevation...');

  return new Promise((resolve) => {
    const ps = spawn(
      'powershell.exe',
      ['-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', elevateCmd],
      { stdio: 'pipe', windowsHide: false }
    );

    let errOut = '';
    ps.stderr?.on('data', d => { errOut += d.toString(); });

    ps.on('close', () => {
      const installed = isServiceInstalled();
      console.log('[ServiceManager] Service installed:', installed);
      if (installed) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: `Service not registered. Check: C:\\ProgramData\\POS System\\logs\\service-setup.log\n${errOut}`.trim(),
        });
      }
    });

    ps.on('error', err => {
      resolve({ success: false, error: err.message });
    });
  });
}

module.exports = { installHealthService, isServiceInstalled };
