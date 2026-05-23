#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import App from './app.js'
import { parseArgs, HELP_TEXT } from './lib/cli.js'
import { enterAltScreen, leaveAltScreen } from './lib/screen.js'

const result = parseArgs(process.argv.slice(2))

if (result.help) {
  console.log(HELP_TEXT)
  process.exit(0)
}

enterAltScreen(process.stdout)

const ink = render(<App config={result.config} />, { exitOnCtrlC: false })

const onSignal = () => { ink.unmount() }
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

try {
  await ink.waitUntilExit()
} finally {
  leaveAltScreen(process.stdout)
}
process.exit(0)
