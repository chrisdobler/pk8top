#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import App from './app.js'
import { parseArgs, HELP_TEXT } from './lib/cli.js'
import { enterAltScreen, installSignalCleanup } from './lib/screen.js'

const result = parseArgs(process.argv.slice(2))

if (result.help) {
  console.log(HELP_TEXT)
  process.exit(0)
}

enterAltScreen(process.stdout)
installSignalCleanup(process, process.stdout)

render(<App config={result.config} />, { exitOnCtrlC: false })
