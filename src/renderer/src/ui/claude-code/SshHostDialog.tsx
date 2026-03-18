import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useStore } from '@/store/store'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Check, X, Plus, Trash2, RefreshCw } from 'lucide-react'
import { Modal, Button } from 'antd'
import { IconPicker, IconType } from './IconPicker'
import { ProjectSelectionList } from './ProjectSelectionList'

const ipcRenderer = window.electron.ipcRenderer

export const SshHostDialog = observer(() => {
  const store = useStore()
  const { t } = useTranslation()
  const dialog = store.sshHost.dialog

  const [activeTab, setActiveTab] = useState<'connection' | 'claude-code'>('connection')
  const [name, setName] = useState('')
  const [hostname, setHostname] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [authMethod, setAuthMethod] = useState<'key' | 'password' | 'agent'>('key')
  const [identityFile, setIdentityFile] = useState('')
  const [password, setPassword] = useState('')
  const [iconType, setIconType] = useState<IconType>('default')
  const [iconValue, setIconValue] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [borderColor, setBorderColor] = useState('')

  // Multi-address state
  const [addresses, setAddresses] = useState<ISshHostAddress[]>([])
  const [activeAddressId, setActiveAddressId] = useState<string>('')

  // Claude Code tab state
  const [ccAllProjects, setCcAllProjects] = useState<IClaudeProject[]>([])
  const [ccSelectedIds, setCcSelectedIds] = useState<string[]>([])
  const [ccDisplayNames, setCcDisplayNames] = useState<Record<string, string>>({})
  const [ccScanning, setCcScanning] = useState(false)
  const [ccHasScanned, setCcHasScanned] = useState(false)

  const editingHost = dialog.editingHost

  useEffect(() => {
    if (dialog.showHostDialog) {
      setActiveTab(dialog.initialTab)
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
        setAddresses(editingHost.addresses || [])
        setActiveAddressId(editingHost.activeAddressId || '')
        setBorderColor(editingHost.borderColor || '')
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
        setAddresses([])
        setActiveAddressId('')
        setBorderColor('')
      }
      setTestStatus('idle')
      setTestError('')
      setCcAllProjects([])
      setCcSelectedIds([])
      setCcDisplayNames({})
      setCcScanning(false)
      setCcHasScanned(false)
    }
  }, [dialog.showHostDialog, editingHost])

  const loadClaudeCodeProjects = useCallback(async () => {
    if (!editingHost) return
    setCcScanning(true)
    try {
      const all: IClaudeProject[] = await ipcRenderer.invoke(
        'ssh-host:getRemoteProjects',
        editingHost.id
      )
      const imported = store.settings.state.claudeCodeImportedProjects || {}
      const existingIds =
        typeof imported === 'object' && !Array.isArray(imported)
          ? (imported as any)[editingHost.id] || []
          : []
      const configs = store.claudeCode.state.projectConfigs
      const displayNames: Record<string, string> = {}
      for (const p of all || []) {
        if (configs[p.id]?.displayName) {
          displayNames[p.id] = configs[p.id].displayName!
        }
      }
      setCcAllProjects(all || [])
      setCcSelectedIds(
        existingIds.length > 0
          ? existingIds.filter((id: string) => (all || []).some((p) => p.id === id))
          : (all || []).map((p) => p.id)
      )
      setCcDisplayNames(displayNames)
    } catch (e) {
      console.error('Failed to scan remote projects', e)
      setCcAllProjects([])
    } finally {
      setCcScanning(false)
      setCcHasScanned(true)
    }
  }, [editingHost, store])

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

  const handleIconChange = (type: IconType, value: string) => {
    setIconType(type)
    setIconValue(value)
  }

  const getTestAddress = (): { hostname: string; port: number } => {
    if (addresses.length > 0) {
      const selected = addresses.find((a) => a.id === activeAddressId)
      if (selected) return { hostname: selected.hostname, port: selected.port }
      return { hostname: addresses[0].hostname, port: addresses[0].port }
    }
    return { hostname, port: parseInt(port) || 22 }
  }

  const handleTestConnection = async () => {
    setTestStatus('testing')
    setTestError('')
    const addr = getTestAddress()
    try {
      const result = await ipcRenderer.invoke('ssh-host:testConnection', {
        hostname: addr.hostname,
        port: addr.port,
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

  const handleAddAddress = () => {
    const newAddr: ISshHostAddress = {
      id: crypto.randomUUID(),
      label: '',
      hostname: addresses.length === 0 ? hostname : '',
      port: addresses.length === 0 ? parseInt(port) || 22 : 22
    }
    if (addresses.length === 0 && hostname) {
      // Auto-create first entry from current hostname/port
      const firstAddr: ISshHostAddress = {
        id: crypto.randomUUID(),
        label: '',
        hostname,
        port: parseInt(port) || 22
      }
      setAddresses([firstAddr, newAddr])
      setActiveAddressId(firstAddr.id)
    } else {
      setAddresses([...addresses, newAddr])
      if (!activeAddressId && addresses.length === 0) {
        setActiveAddressId(newAddr.id)
      }
    }
  }

  const handleRemoveAddress = (id: string) => {
    const filtered = addresses.filter((a) => a.id !== id)
    setAddresses(filtered)
    if (activeAddressId === id && filtered.length > 0) {
      setActiveAddressId(filtered[0].id)
    }
    if (filtered.length <= 1) {
      // If only one left, sync back to main fields
      if (filtered.length === 1) {
        setHostname(filtered[0].hostname)
        setPort(String(filtered[0].port))
      }
    }
  }

  const handleUpdateAddress = (id: string, field: string, value: string) => {
    setAddresses((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, [field]: field === 'port' ? parseInt(value) || 22 : value }
          : a
      )
    )
  }

  const handleSave = async () => {
    // Determine effective addresses and hostname/port
    let saveAddresses: ISshHostAddress[] | undefined
    let saveActiveAddressId: string | undefined
    let saveHostname = hostname
    let savePort = parseInt(port) || 22

    if (addresses.length > 1) {
      saveAddresses = addresses
      saveActiveAddressId = activeAddressId || addresses[0].id
      // Sync top-level to active address
      const active = addresses.find((a) => a.id === saveActiveAddressId)
      if (active) {
        saveHostname = active.hostname
        savePort = active.port
      }
    } else if (addresses.length === 1) {
      // Single address — store as legacy
      saveHostname = addresses[0].hostname
      savePort = addresses[0].port
      saveAddresses = undefined
      saveActiveAddressId = undefined
    }

    const data: any = {
      name: name || saveHostname,
      hostname: saveHostname,
      port: savePort,
      username,
      authMethod,
      identityFile: authMethod === 'key' ? identityFile : '',
      password: authMethod === 'password' ? password : '',
      iconType,
      iconValue: iconType !== 'default' ? iconValue : '',
      addresses: saveAddresses || null,
      activeAddressId: saveActiveAddressId || null,
      borderColor: borderColor || null
    }

    if (editingHost) {
      await store.sshHost.updateHost(editingHost.id, data)
    } else {
      await store.sshHost.createHost(data)
    }

    // Save Claude Code tab changes if we have data
    if (editingHost && ccAllProjects.length > 0) {
      const imported = store.settings.state.claudeCodeImportedProjects || {}
      const obj =
        typeof imported === 'object' && !Array.isArray(imported)
          ? { ...imported }
          : { local: imported as any }
      obj[editingHost.id] = ccSelectedIds
      await store.settings.setSetting('claudeCodeImportedProjects', obj)
      // Save display names
      for (const [projectId, dn] of Object.entries(ccDisplayNames)) {
        await ipcRenderer.invoke('claude-code:setProjectConfig', {
          projectId,
          hostId: editingHost.id,
          displayName: dn
        })
      }
      await store.claudeCode.loadProjects()
    }

    store.sshHost.closeHostDialog()
  }

  const inputClass =
    'w-full text-sm py-1.5 px-2.5 rounded border border-theme ' +
    'primary-bg-color md-text placeholder:text-secondary ' +
    'outline-none focus:border-blue-500 transition-colors'

  const labelClass = 'text-xs text-secondary mb-1 block'

  const tabClass = (tab: string) =>
    'px-3 py-1.5 text-sm rounded-t cursor-pointer transition-colors ' +
    (activeTab === tab
      ? 'md-text border-b-2 border-blue-500 font-medium'
      : 'text-secondary hover:text-current')

  const isClaudeCodeTabDisabled = !editingHost

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
            disabled={
              activeTab === 'connection'
                ? addresses.length > 1
                  ? !username || addresses.some((a) => !a.hostname)
                  : !hostname || !username
                : false
            }
            onClick={handleSave}
          >
            {t('sshHost.save')}
          </Button>
        </div>
      }
      width={520}
      zIndex={2200}
    >
      {/* Tab bar */}
      <div className={'flex gap-1 border-b border-theme mb-3'}>
        <button className={tabClass('connection')} onClick={() => setActiveTab('connection')}>
          {t('sshHost.connectionTab')}
        </button>
        <button
          className={tabClass('claude-code') + (isClaudeCodeTabDisabled ? ' opacity-40 cursor-not-allowed' : '')}
          onClick={() => !isClaudeCodeTabDisabled && setActiveTab('claude-code')}
        >
          {t('sshHost.claudeCodeTab')}
        </button>
      </div>

      {activeTab === 'connection' ? (
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

          {/* Addresses section */}
          {addresses.length <= 1 ? (
            <>
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
              <button
                className={'text-xs text-blue-500 hover:underline'}
                onClick={handleAddAddress}
              >
                + {t('sshHost.addAddress')}
              </button>
            </>
          ) : (
            <div>
              <div className={'flex items-center justify-between mb-2'}>
                <label className={labelClass + ' mb-0'}>{t('sshHost.addresses')}</label>
                <button
                  className={'text-xs text-blue-500 hover:underline flex items-center gap-0.5'}
                  onClick={handleAddAddress}
                >
                  <Plus size={12} />
                  {t('sshHost.addAddress')}
                </button>
              </div>
              <div className={'space-y-2'}>
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={
                      'flex items-center gap-2 p-2 rounded border ' +
                      (activeAddressId === addr.id ? 'border-blue-500' : 'border-theme')
                    }
                  >
                    <input
                      type={'radio'}
                      name={'activeAddress'}
                      checked={activeAddressId === addr.id}
                      onChange={() => setActiveAddressId(addr.id)}
                      title={t('sshHost.activeAddress')}
                    />
                    <input
                      className={
                        'text-xs py-1 px-1.5 rounded border border-theme ' +
                        'primary-bg-color md-text outline-none w-20'
                      }
                      value={addr.label || ''}
                      onChange={(e) => handleUpdateAddress(addr.id, 'label', e.target.value)}
                      placeholder={t('sshHost.addressLabel')}
                    />
                    <input
                      className={
                        'text-xs py-1 px-1.5 rounded border border-theme ' +
                        'primary-bg-color md-text outline-none flex-1'
                      }
                      value={addr.hostname}
                      onChange={(e) => handleUpdateAddress(addr.id, 'hostname', e.target.value)}
                      placeholder={t('sshHost.hostname')}
                    />
                    <input
                      className={
                        'text-xs py-1 px-1.5 rounded border border-theme ' +
                        'primary-bg-color md-text outline-none w-14'
                      }
                      value={String(addr.port)}
                      onChange={(e) => handleUpdateAddress(addr.id, 'port', e.target.value)}
                      placeholder={'22'}
                    />
                    <button
                      className={'text-secondary hover:text-red-500 transition-colors shrink-0'}
                      onClick={() => handleRemoveAddress(addr.id)}
                      title={t('sshHost.removeAddress')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            <IconPicker
              iconType={iconType}
              iconValue={iconValue}
              onChange={handleIconChange}
            />
          </div>

          <div>
            <label className={labelClass}>{t('sshHost.borderColor')}</label>
            <div className={'flex items-center gap-2'}>
              <input
                type={'color'}
                value={borderColor || '#3b82f6'}
                onChange={(e) => setBorderColor(e.target.value)}
                className={'w-7 h-7 rounded cursor-pointer border border-theme p-0.5'}
                style={{ background: 'transparent' }}
              />
              {borderColor ? (
                <>
                  <div
                    className={'h-5 w-12 rounded border border-theme'}
                    style={{ backgroundColor: borderColor }}
                  />
                  <button
                    className={'text-xs text-secondary hover:text-current transition-colors'}
                    onClick={() => setBorderColor('')}
                  >
                    {t('tabs.clearColor')}
                  </button>
                </>
              ) : (
                <span className={'text-xs text-secondary'}>{t('sshHost.iconDefault')}</span>
              )}
            </div>
          </div>

          <div className={'flex items-center gap-2 pt-1'}>
            <Button
              onClick={handleTestConnection}
              disabled={
                addresses.length > 1
                  ? !username || !addresses.find((a) => a.id === activeAddressId)?.hostname
                  : !hostname || !username || testStatus === 'testing'
              }
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
      ) : (
        /* Claude Code tab */
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <div className={'flex items-center justify-between mb-3'}>
            <span className={'text-sm text-secondary'}>
              {t('claudeCode.manageProjectsDesc', { count: ccAllProjects.length })}
            </span>
            <Button
              size={'small'}
              onClick={loadClaudeCodeProjects}
              disabled={ccScanning}
              icon={<RefreshCw size={13} className={ccScanning ? 'animate-spin' : ''} />}
            >
              {ccScanning ? t('sshHost.testing') : t('sshHost.resyncProject')}
            </Button>
          </div>
          {ccAllProjects.length > 0 ? (
            <ProjectSelectionList
              allProjects={ccAllProjects}
              selectedIds={ccSelectedIds}
              displayNames={ccDisplayNames}
              scanning={false}
              isRemote={true}
              onToggle={(id) => {
                setCcSelectedIds((prev) => {
                  const idx = prev.indexOf(id)
                  if (idx >= 0) return prev.filter((x) => x !== id)
                  return [...prev, id]
                })
              }}
              onToggleAll={() => {
                setCcSelectedIds((prev) => {
                  if (prev.length === ccAllProjects.length) return []
                  return ccAllProjects.map((p) => p.id)
                })
              }}
              onDisplayNameChange={(projectId, dn) => {
                setCcDisplayNames((prev) => ({ ...prev, [projectId]: dn }))
              }}
            />
          ) : ccScanning ? (
            <div className={'flex items-center justify-center py-12'}>
              <Loader2 size={20} className={'animate-spin text-secondary'} />
            </div>
          ) : ccHasScanned ? (
            <div className={'text-center py-8 text-secondary'}>
              <p className={'text-xs'}>{t('sshHost.remoteImportNone')}</p>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
})
