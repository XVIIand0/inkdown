import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useStore } from '@/store/store'
import { useState, useEffect } from 'react'
import { Loader2, Check, X, Upload } from 'lucide-react'
import { Modal, Button } from 'antd'

const ipcRenderer = window.electron.ipcRenderer

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'
]

export const SshHostDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const dialog = store.sshHost.dialog

  const [name, setName] = useState('')
  const [hostname, setHostname] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [authMethod, setAuthMethod] = useState<'key' | 'password' | 'agent'>('key')
  const [identityFile, setIdentityFile] = useState('')
  const [password, setPassword] = useState('')
  const [iconType, setIconType] = useState<'default' | 'color' | 'image'>('default')
  const [iconValue, setIconValue] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const editingHost = dialog.editingHost

  useEffect(() => {
    if (dialog.showHostDialog) {
      if (editingHost) {
        setName(editingHost.name || '')
        setHostname(editingHost.hostname || '')
        setPort(String(editingHost.port || 22))
        setUsername(editingHost.username || '')
        setAuthMethod(editingHost.authMethod || 'key')
        setIdentityFile(editingHost.identityFile || '')
        setPassword(editingHost.password || '')
        setIconType(editingHost.iconType || 'default')
        setIconValue(editingHost.iconValue || '')
      } else {
        setName('')
        setHostname('')
        setPort('22')
        setUsername('')
        setAuthMethod('key')
        setIdentityFile('')
        setPassword('')
        setIconType('default')
        setIconValue('')
      }
      setTestStatus('idle')
      setTestError('')
    }
  }, [dialog.showHostDialog, editingHost])

  const handleBrowseKey = async () => {
    try {
      const result = await ipcRenderer.invoke('showOpenDialog', {
        title: t('sshHost.identityFile'),
        properties: ['openFile']
      })
      if (result && !result.canceled && result.filePaths?.[0]) {
        setIdentityFile(result.filePaths[0])
      }
    } catch {
      // ignore
    }
  }

  const handleImageUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        setIconValue(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleTestConnection = async () => {
    setTestStatus('testing')
    setTestError('')
    try {
      const result = await ipcRenderer.invoke('ssh-host:testConnection', {
        hostname,
        port: parseInt(port) || 22,
        username,
        authMethod,
        identityFile: authMethod === 'key' ? identityFile : undefined,
        password: authMethod === 'password' ? password : undefined
      })
      if (result.success) {
        setTestStatus('success')
      } else {
        setTestStatus('error')
        setTestError(result.error || t('sshHost.connectionFailed'))
      }
    } catch (err: any) {
      setTestStatus('error')
      setTestError(err.message || t('sshHost.connectionFailed'))
    }
  }

  const handleSave = () => {
    const data = {
      name: name || hostname,
      hostname,
      port: parseInt(port) || 22,
      username,
      authMethod,
      identityFile: authMethod === 'key' ? identityFile : '',
      password: authMethod === 'password' ? password : '',
      iconType,
      iconValue: iconType !== 'default' ? iconValue : ''
    }

    if (editingHost) {
      store.sshHost.updateHost(editingHost.id, data)
    } else {
      store.sshHost.createHost(data)
    }
    store.sshHost.closeHostDialog()
  }

  const inputClass =
    'w-full text-sm py-1.5 px-2.5 rounded border border-theme ' +
    'primary-bg-color md-text placeholder:text-secondary ' +
    'outline-none focus:border-blue-500 transition-colors'

  const labelClass = 'text-xs text-secondary mb-1 block'

  return (
    <Modal
      open={dialog.showHostDialog}
      title={
        <span>{editingHost ? t('sshHost.editHost') : t('sshHost.addHost')}</span>
      }
      onCancel={() => store.sshHost.closeHostDialog()}
      footer={
        <div className={'flex justify-end gap-2'}>
          <Button onClick={() => store.sshHost.closeHostDialog()}>
            {t('sshHost.cancel')}
          </Button>
          <Button
            type={'primary'}
            disabled={!hostname || !username}
            onClick={handleSave}
          >
            {t('sshHost.save')}
          </Button>
        </div>
      }
      width={480}
      zIndex={2200}
    >
      <div className={'space-y-3'}>
        <div>
          <label className={labelClass}>{t('sshHost.name')}</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={hostname || 'My Server'}
          />
        </div>

        <div className={'grid grid-cols-3 gap-2'}>
          <div className={'col-span-2'}>
            <label className={labelClass}>{t('sshHost.hostname')}</label>
            <input
              className={inputClass}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder={'example.com'}
            />
          </div>
          <div>
            <label className={labelClass}>{t('sshHost.port')}</label>
            <input
              className={inputClass}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={'22'}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('sshHost.username')}</label>
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={'root'}
          />
        </div>

        <div>
          <label className={labelClass}>{t('sshHost.authMethod')}</label>
          <div className={'flex items-center gap-4'}>
            <label className={'flex items-center gap-1.5 text-sm md-text cursor-pointer'}>
              <input
                type={'radio'}
                name={'authMethod'}
                checked={authMethod === 'key'}
                onChange={() => setAuthMethod('key')}
              />
              {t('sshHost.authKey')}
            </label>
            <label className={'flex items-center gap-1.5 text-sm md-text cursor-pointer'}>
              <input
                type={'radio'}
                name={'authMethod'}
                checked={authMethod === 'password'}
                onChange={() => setAuthMethod('password')}
              />
              {t('sshHost.authPassword')}
            </label>
            <label className={'flex items-center gap-1.5 text-sm md-text cursor-pointer'}>
              <input
                type={'radio'}
                name={'authMethod'}
                checked={authMethod === 'agent'}
                onChange={() => setAuthMethod('agent')}
              />
              {t('sshHost.authAgent')}
            </label>
          </div>
        </div>

        {authMethod === 'key' && (
          <div>
            <label className={labelClass}>{t('sshHost.identityFile')}</label>
            <div className={'flex items-center gap-2'}>
              <input
                className={inputClass + ' flex-1'}
                value={identityFile}
                onChange={(e) => setIdentityFile(e.target.value)}
                placeholder={'~/.ssh/id_rsa'}
              />
              <Button size={'small'} onClick={handleBrowseKey}>
                {t('sshHost.browse')}
              </Button>
            </div>
          </div>
        )}

        {authMethod === 'password' && (
          <div>
            <label className={labelClass}>{t('sshHost.password')}</label>
            <input
              className={inputClass}
              type={'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>{t('sshHost.icon')}</label>
          <div className={'flex items-center gap-4 mb-2'}>
            <label className={'flex items-center gap-1.5 text-sm md-text cursor-pointer'}>
              <input
                type={'radio'}
                name={'iconType'}
                checked={iconType === 'default'}
                onChange={() => setIconType('default')}
              />
              {t('sshHost.iconDefault')}
            </label>
            <label className={'flex items-center gap-1.5 text-sm md-text cursor-pointer'}>
              <input
                type={'radio'}
                name={'iconType'}
                checked={iconType === 'color'}
                onChange={() => setIconType('color')}
              />
              {t('sshHost.iconColor')}
            </label>
            <label className={'flex items-center gap-1.5 text-sm md-text cursor-pointer'}>
              <input
                type={'radio'}
                name={'iconType'}
                checked={iconType === 'image'}
                onChange={() => setIconType('image')}
              />
              {t('sshHost.iconImage')}
            </label>
          </div>

          {iconType === 'color' && (
            <div className={'flex items-center gap-2 flex-wrap'}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={
                    'w-6 h-6 rounded-full border-2 transition-colors ' +
                    (iconValue === c ? 'border-blue-500' : 'border-transparent')
                  }
                  style={{ background: c }}
                  onClick={() => setIconValue(c)}
                />
              ))}
              <input
                className={'w-20 text-xs py-1 px-2 rounded border border-theme primary-bg-color md-text'}
                value={iconValue}
                onChange={(e) => setIconValue(e.target.value)}
                placeholder={'#hex'}
              />
            </div>
          )}

          {iconType === 'image' && (
            <div className={'flex items-center gap-2'}>
              {iconValue && (
                <img src={iconValue} className={'w-8 h-8 rounded object-cover'} />
              )}
              <Button
                size={'small'}
                icon={<Upload size={14} />}
                onClick={handleImageUpload}
              >
                {t('sshHost.browse')}
              </Button>
            </div>
          )}
        </div>

        <div className={'flex items-center gap-2 pt-1'}>
          <Button
            onClick={handleTestConnection}
            disabled={!hostname || !username || testStatus === 'testing'}
          >
            {testStatus === 'testing' ? (
              <span className={'flex items-center gap-1.5'}>
                <Loader2 size={14} className={'animate-spin'} />
                {t('sshHost.testing')}
              </span>
            ) : (
              t('sshHost.testConnection')
            )}
          </Button>
          {testStatus === 'success' && (
            <span className={'flex items-center gap-1 text-xs text-green-500'}>
              <Check size={14} />
              {t('sshHost.connected')}
            </span>
          )}
          {testStatus === 'error' && (
            <span className={'flex items-center gap-1 text-xs text-red-500'}>
              <X size={14} />
              {testError || t('sshHost.connectionFailed')}
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
})
