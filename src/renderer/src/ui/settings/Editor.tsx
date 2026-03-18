import { observer } from 'mobx-react-lite'
import { Button, Checkbox, Radio, Slider } from 'antd'
import { useStore } from '@/store/store'
import { TextHelp } from '../common/HelpText'
import { useTranslation } from 'react-i18next'
import { Select } from '@lobehub/ui'
import { useCallback, useEffect, useState } from 'react'

import { themes } from '@/themes/themes'

const ipcRenderer = window.electron.ipcRenderer

const DataPathSetting = () => {
  const store = useStore()
  const { t } = useTranslation()
  const [dataPath, setDataPath] = useState('')
  const [defaultPath, setDefaultPath] = useState('')

  useEffect(() => {
    ipcRenderer.invoke('getCustomDataPath').then((p: string) => setDataPath(p))
    store.system.userDataPath().then((p: string) => setDefaultPath(p))
  }, [])

  const handleChange = useCallback(async () => {
    const result = await store.system.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (!result.canceled && result.filePaths[0]) {
      const newPath = result.filePaths[0]
      await ipcRenderer.invoke('setCustomDataPath', newPath)
      setDataPath(newPath)
    }
  }, [])

  const handleReset = useCallback(async () => {
    await ipcRenderer.invoke('setCustomDataPath', '')
    setDataPath('')
  }, [])

  return (
    <div className={'flex justify-between items-center py-3'}>
      <div className={'text-sm'}>
        <span className={'mr-1'}>{t('settings.data_path')}</span>
        <TextHelp text={t('settings.data_path_help')} />
      </div>
      <div className={'flex items-center gap-2'}>
        <span className={'text-xs text-gray-500 max-w-48 truncate'} title={dataPath || defaultPath}>
          {dataPath || defaultPath}
        </span>
        <Button size={'small'} onClick={handleChange}>{t('settings.data_path_change')}</Button>
        {dataPath && (
          <Button size={'small'} onClick={handleReset}>{t('settings.data_path_reset')}</Button>
        )}
      </div>
    </div>
  )
}

const ThemePicker = observer(() => {
  const store = useStore()
  const activeTheme = store.settings.state.activeTheme || 'paper-crane'

  return (
    <div className={'py-3'}>
      <div className={'text-sm mb-2'}>Color Theme</div>
      <div className={'grid grid-cols-2 gap-2'}>
        {themes.map((theme) => (
          <div
            key={theme.id}
            className={
              'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border duration-150 ' +
              (activeTheme === theme.id
                ? 'border-blue-500 dark:border-blue-400'
                : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5')
            }
            onClick={() => store.settings.setSetting('activeTheme', theme.id)}
          >
            <div className={'flex gap-1 shrink-0'}>
              <div
                className={'w-4 h-4 rounded-full border border-black/10 dark:border-white/10'}
                style={{ background: theme.colors.light.accent }}
              />
              <div
                className={'w-4 h-4 rounded-full border border-black/10 dark:border-white/10'}
                style={{ background: theme.colors.light.primaryBg }}
              />
              <div
                className={'w-4 h-4 rounded-full border border-black/10 dark:border-white/10'}
                style={{ background: theme.colors.dark.primaryBg }}
              />
              <div
                className={'w-4 h-4 rounded-full border border-black/10 dark:border-white/10'}
                style={{ background: theme.colors.dark.accent }}
              />
            </div>
            <span className={'text-xs truncate'}>{theme.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

export const SetEditor = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  return (
    <div className={'divide-y divide-gray-200 dark:divide-gray-200/10 px-2'}>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>
          <span className={'mr-1'}>{t('settings.language')}</span>
        </div>
        <div>
          <Select
            value={store.settings.state.language}
            dropdownStyle={{ zIndex: 2210 }}
            className={'w-36'}
            onChange={(e) => {
              store.settings.setSetting('language', e)
            }}
            options={[
              {
                label: 'English',
                value: 'en'
              },
              {
                label: '简体中文',
                value: 'zh'
              },
              {
                label: '繁體中文',
                value: 'zh-TW'
              }
            ]}
          />
        </div>
      </div>
      <DataPathSetting />
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>
          <span className={'mr-1'}>{t('settings.theme')}</span>
        </div>
        <div>
          <Radio.Group
            value={store.settings.state.theme}
            onChange={(e) => {
              store.settings.setSetting('theme', e.target.value)
            }}
            options={[
              {
                label: t('settings.theme_system'),
                value: 'system'
              },
              {
                label: t('settings.theme_light'),
                value: 'light'
              },
              {
                label: t('settings.theme_dark'),
                value: 'dark'
              }
            ]}
          />
        </div>
      </div>
      <ThemePicker />
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm flex items-center'}>
          <span className={'mr-1'}>{t('settings.show_outline')}</span>
          <TextHelp text={t('settings.show_outline_help')} />
        </div>
        <div>
          <Checkbox
            checked={store.settings.state.showHeading}
            onChange={(e) => {
              store.settings.setSetting('showHeading', e.target.checked)
            }}
          />
        </div>
      </div>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>{t('settings.outline_max_width')}</div>
        <div>
          <Slider
            className={'w-64'}
            value={store.settings.state.headingWidth}
            min={260}
            max={400}
            styles={{
              root: { zIndex: 2210 }
            }}
            marks={{ 260: '260', 400: '400' }}
            step={20}
            onChange={(e) => {
              store.settings.setSetting('headingWidth', e)
            }}
          />
        </div>
      </div>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>
          <span>{t('settings.reduce_filename_input')}</span>
        </div>
        <div>
          <Checkbox
            checked={store.settings.state.reduceFileName}
            onChange={(e) => {
              store.settings.setSetting('reduceFileName', e.target.checked)
            }}
          />
        </div>
      </div>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>{t('settings.code_fence_tabsize')}</div>
        <div>
          <Radio.Group
            value={store.settings.state.codeTabSize}
            onChange={(e) => {
              store.settings.setSetting('codeTabSize', e.target.value)
            }}
          >
            <Radio value={2}>2</Radio>
            <Radio value={4}>4</Radio>
          </Radio.Group>
        </div>
      </div>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>{t('settings.code_auto_break')}</div>
        <div>
          <Checkbox
            checked={store.settings.state.codeAutoBreak}
            onChange={(e) => {
              store.settings.setSetting('codeAutoBreak', e.target.checked)
            }}
          ></Checkbox>
        </div>
      </div>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm'}>{t('settings.spell_check')}</div>
        <div>
          <Checkbox
            checked={store.settings.state.spellCheck}
            onChange={(e) => {
              store.settings.setSetting('spellCheck', e.target.checked)
            }}
          />
        </div>
      </div>
      <div className={'flex justify-between items-center py-3'}>
        <div className={'text-sm flex items-center'}>
          <span className={'mr-1'}>{t('settings.use_dollar_formula')}</span>
          <TextHelp text={t('settings.use_dollar_formula_help')} />
        </div>
        <div>
          <Checkbox
            checked={store.settings.state.autoConvertInlineFormula}
            onChange={(e) =>
              store.settings.setSetting('autoConvertInlineFormula', e.target.checked)
            }
          />
        </div>
      </div>
    </div>
  )
})
