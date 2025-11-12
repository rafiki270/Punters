#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const displayUrl = process.env.PUNTERS_DISPLAY_URL || 'http://localhost:3000'

function resolveBinary(name) {
  try {
    return execFileSync('bash', ['-lc', `command -v ${name}`]).toString().trim()
  } catch {
    throw new Error(`Unable to locate '${name}' on PATH. Ensure it is installed and retry.`)
  }
}

function log(msg) {
  process.stdout.write(`[service] ${msg}\n`)
}

function requireRoot(tag) {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    throw new Error(`${tag} requires sudo/root privileges. Re-run with: sudo make service`)
  }
}

function getTargetUser() {
  return process.env.SUDO_USER || process.env.USER || os.userInfo().username
}

function getUserMeta(username) {
  const uid = Number(execFileSync('id', ['-u', username]).toString().trim())
  const gid = Number(execFileSync('id', ['-g', username]).toString().trim())
  const group = execFileSync('id', ['-gn', username]).toString().trim()
  const home = execFileSync('sh', ['-c', `eval echo ~${username}`]).toString().trim()
  return { uid, gid, group, home }
}

function ensureExecutable(filePath) {
  return fs.chmod(filePath, 0o755).catch(() => {})
}

async function installSystemd() {
  requireRoot('Systemd installation')
  const user = getTargetUser()
  const { uid, gid } = getUserMeta(user)
  const serviceDir = '/etc/systemd/system'
  const serverServicePath = path.join(serviceDir, 'punters.service')
  const browserServicePath = path.join(serviceDir, 'punters-browser.service')
  const openScript = path.join(repoRoot, 'scripts', 'open-display.sh')
  await ensureExecutable(openScript)

  const npmPath = resolveBinary('npm')

  const serverExec = `cd "${repoRoot}" && ${npmPath} run start`
  const browserExec = `cd "${repoRoot}" && "${openScript}" "${displayUrl}"`

  const serverUnit = `[Unit]
Description=Punters Display Server
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${repoRoot}
Environment=NODE_ENV=production
ExecStart=/bin/bash -lc '${serverExec}'
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=punters-server

[Install]
WantedBy=multi-user.target
`

  const browserUnit = `[Unit]
Description=Punters Display Browser
After=graphical.target punters.service
Requires=punters.service
Wants=punters.service

[Service]
Type=oneshot
User=${user}
WorkingDirectory=${repoRoot}
ExecStart=/bin/bash -lc '${browserExec}'
RemainAfterExit=yes

[Install]
WantedBy=graphical.target
`

  await fs.writeFile(serverServicePath, serverUnit, 'utf8')
  await fs.writeFile(browserServicePath, browserUnit, 'utf8')
  await fs.chown(serverServicePath, uid, gid)
  await fs.chown(browserServicePath, uid, gid)

  execFileSync('systemctl', ['daemon-reload'])
  execFileSync('systemctl', ['enable', '--now', 'punters.service'])
  execFileSync('systemctl', ['enable', '--now', 'punters-browser.service'])
  log('Systemd services installed and started (punters.service, punters-browser.service).')
}

async function installLaunchd() {
  requireRoot('Launchd installation')
  const user = getTargetUser()
  const { uid, gid, home } = getUserMeta(user)
  const agentsDir = path.join(home, 'Library', 'LaunchAgents')
  await fs.mkdir(agentsDir, { recursive: true })
  const serverPlist = path.join(agentsDir, 'com.punters.server.plist')
  const browserPlist = path.join(agentsDir, 'com.punters.browser.plist')
  const npmPath = resolveBinary('npm')
  const openScript = path.join(repoRoot, 'scripts', 'open-display.sh')
  await ensureExecutable(openScript)

  const serverPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.punters.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd "${repoRoot}" && ${npmPath} run start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(repoRoot, 'logs/server.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(repoRoot, 'logs/server-error.log')}</string>
</dict>
</plist>
`

  const browserPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.punters.browser</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>"${openScript}" "${displayUrl}"</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`

  const logsDir = path.join(repoRoot, 'logs')
  await fs.mkdir(logsDir, { recursive: true }).catch(() => {})
  await fs.chown(logsDir, uid, gid).catch(() => {})
  await fs.writeFile(serverPlist, serverPlistContent, 'utf8')
  await fs.writeFile(browserPlist, browserPlistContent, 'utf8')
  await fs.chown(serverPlist, uid, gid).catch(() => {})
  await fs.chown(browserPlist, uid, gid).catch(() => {})

  const domain = `gui/${uid}`
  const bootout = (...args) => {
    try {
      execFileSync('launchctl', ['bootout', ...args], { stdio: 'ignore' })
    } catch {}
  }
  const bootstrap = (...args) => {
    execFileSync('launchctl', ['bootstrap', ...args])
  }

  bootout(domain, serverPlist)
  bootstrap(domain, serverPlist)
  bootout(domain, browserPlist)
  bootstrap(domain, browserPlist)
  log('Launchd agents installed and loaded (com.punters.server, com.punters.browser).')
}

async function main() {
  try {
    if (process.platform === 'linux') {
      await installSystemd()
      log('Auto-start and browser launch configured for Linux systemd.')
    } else if (process.platform === 'darwin') {
      if (process.env.SUDO_USER == null) {
        log('Tip: run via sudo so launchctl can manage user agents if needed.')
      }
      await installLaunchd()
      log('Auto-start and browser launch configured for macOS launchd.')
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

await main()
