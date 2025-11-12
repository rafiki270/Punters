#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let hasPlaywright = false
try {
  require.resolve('@playwright/test/package.json')
  hasPlaywright = true
} catch {
  hasPlaywright = false
}

if (!hasPlaywright) {
  console.warn('[smoke] @playwright/test not installed; skipping browser smoke suite.')
  process.exit(0)
}

const child = spawn('npx', ['playwright', 'test', 'tests/smoke/display.spec.ts'], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
