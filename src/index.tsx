#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import App from './app.js'
import type { AppConfig } from './types.js'

function parseArgs(): AppConfig {
  const args = process.argv.slice(2)
  let interval = 3.3
  let historyPoints = 60

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--interval' || args[i] === '-i') && args[i + 1]) {
      interval = parseFloat(args[i + 1] ?? '3.3')
    }
    if ((args[i] === '--history' || args[i] === '-H') && args[i + 1]) {
      historyPoints = parseInt(args[i + 1] ?? '60', 10)
    }
    if (args[i] === '--help') {
      console.log('Usage: pk8top [--interval <seconds>] [--history <points>]')
      console.log('  --interval, -i  Refresh interval in seconds (default: 3.3)')
      console.log('  --history, -H   History points to keep (default: 60)')
      process.exit(0)
    }
  }

  return { interval, historyPoints }
}

render(<App config={parseArgs()} />, { exitOnCtrlC: true })
