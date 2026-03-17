import { app, BrowserWindow } from 'electron'
import { existsSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Read custom userData path from config.json BEFORE any module
// that calls app.getPath('userData') at import time
const configPath = join(app.getAppPath(), 'config.json')
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (config.userDataPath) {
      if (!existsSync(config.userDataPath)) {
        mkdirSync(config.userDataPath, { recursive: true })
      }
      app.setPath('userData', config.userDataPath)
    }
  } catch (_) {}
}

// Dynamic imports so they run AFTER setPath
async function bootstrap() {
  const { electronApp, optimizer } = await import('@electron-toolkit/utils')
  const { Bound, createWindow, lastCloseWindow, winMap } = await import('./window')
  const { knex } = await import('./database/model')
  const { modelReady } = await import('./database/api')
  await import('./handle')
  await import('./claude-code')
  await import('./claude-code-cli')
  await import('./ssh-host')
  const { registerUpdate } = await import('./update')

  app.whenReady().then(async () => {
    await modelReady()
    electronApp.setAppUserModelId('com.inkdown')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    knex('setting')
      .where('key', 'windows')
      .first()
      .then((row) => {
        let created = false
        if (row) {
          try {
            const data = JSON.parse(row.value)
            for (const item of data) {
              created = true
              createWindow(item)
            }
          } catch (e) {
            created = true
            createWindow()
          }
        }
        if (!created) {
          createWindow()
        }
      })
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    registerUpdate()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', async () => {
    const wins = BrowserWindow.getAllWindows()
    let data: Bound[] = []
    if (wins.length) {
      for (const w of wins) {
        const bound = w.getBounds()
        data.push({
          width: bound.width,
          height: bound.height,
          x: bound.x,
          y: bound.y,
          id: winMap.get(w),
          focus: w.isFocused()
        })
      }
    } else if (lastCloseWindow) {
      data.push(lastCloseWindow)
    }
    const row = await knex('setting').where('key', 'windows').first()
    if (row) {
      return knex('setting')
        .where('key', 'windows')
        .update({ value: JSON.stringify(data) })
    }
    return knex('setting').insert({ key: 'windows', value: JSON.stringify(data) })
  })
}

bootstrap()
