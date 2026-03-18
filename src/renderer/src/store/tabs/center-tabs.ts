import { computed, makeObservable } from 'mobx'
import { StructStore } from '../struct'
import { Store } from '../store'
import {
  CenterTab,
  LayoutNode,
  LayoutTabGroup,
  LayoutSplitNode,
  SplitDirection,
  DropZone
} from './types'

const DEFAULT_GROUP_ID = 'default'

function makeDefaultRoot(): LayoutTabGroup {
  return { type: 'tab-group', id: DEFAULT_GROUP_ID, tabIds: [], activeTabId: null }
}

const state = {
  tabs: [] as CenterTab[],
  activeTabId: null as string | null,
  root: makeDefaultRoot() as LayoutNode,
  focusedGroupId: DEFAULT_GROUP_ID as string
}

export class CenterTabStore extends StructStore<typeof state> {
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null
  private _closedTabs: CenterTab[] = []
  private readonly MAX_CLOSED = 20

  constructor(private readonly store: Store) {
    super(state)
    makeObservable(this, {
      activeTab: computed,
      focusedGroup: computed,
      allGroups: computed
    })
  }

  // ─── Backward-compat computed ───

  get activeTab(): CenterTab | null {
    if (!this.state.activeTabId) return null
    return this.state.tabs.find((t) => t.id === this.state.activeTabId) || null
  }

  get focusedGroup(): LayoutTabGroup | null {
    return this.findGroup(this.state.focusedGroupId)
  }

  get allGroups(): LayoutTabGroup[] {
    const groups: LayoutTabGroup[] = []
    const collect = (node: LayoutNode) => {
      if (node.type === 'tab-group') groups.push(node)
      else node.children.forEach(collect)
    }
    collect(this.state.root)
    return groups
  }

  // ─── Tree search helpers ───

  findGroup(groupId: string): LayoutTabGroup | null {
    const search = (node: LayoutNode): LayoutTabGroup | null => {
      if (node.type === 'tab-group') return node.id === groupId ? node : null
      for (const child of node.children) {
        const found = search(child)
        if (found) return found
      }
      return null
    }
    return search(this.state.root)
  }

  findGroupForTab(tabId: string): LayoutTabGroup | null {
    const search = (node: LayoutNode): LayoutTabGroup | null => {
      if (node.type === 'tab-group') return node.tabIds.includes(tabId) ? node : null
      for (const child of node.children) {
        const found = search(child)
        if (found) return found
      }
      return null
    }
    return search(this.state.root)
  }

  private findParent(nodeId: string): { parent: LayoutSplitNode; index: number } | null {
    const search = (
      node: LayoutNode,
      parent: LayoutSplitNode | null,
      idx: number
    ): { parent: LayoutSplitNode; index: number } | null => {
      if (node.id === nodeId && parent) return { parent, index: idx }
      if (node.type === 'split') {
        for (let i = 0; i < node.children.length; i++) {
          const found = search(node.children[i], node, i)
          if (found) return found
        }
      }
      return null
    }
    return search(this.state.root, null, 0)
  }

  private getTab(tabId: string): CenterTab | undefined {
    return this.state.tabs.find((t) => t.id === tabId)
  }

  // ─── Sync activeTabId from focused group ───

  private syncActiveTabId() {
    const group = this.focusedGroup
    this.state.activeTabId = group?.activeTabId || null
  }

  private scheduleLayoutSave() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer)
    this._debounceTimer = setTimeout(() => {
      const serialized = JSON.parse(JSON.stringify(this.state.root))
      this.store.settings.setSetting('claudeCodeLayout', serialized)
    }, 500)
  }

  // ─── Open tab methods (backward compat API) ───

  openSessionTab(projectId: string | null, sessionId: string, title: string, hostId?: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'session' && t.sessionId === sessionId
    )
    if (existing) {
      this._focusTab(existing.id)
      return
    }
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'session',
      title,
      sessionId,
      projectId: projectId || undefined,
      hostId
    }
    this._addTab(tab)
  }

  openMindNoteTab(noteId: string, title: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'mind-note' && t.noteId === noteId
    )
    if (existing) {
      this._focusTab(existing.id)
      return
    }
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'mind-note',
      title,
      noteId
    }
    this._addTab(tab)
  }

  openCodeFileTab(filePath: string, projectId?: string, hostId?: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'code-file' && t.filePath === filePath
    )
    if (existing) {
      this._focusTab(existing.id)
      return
    }
    const parts = filePath.replace(/\\/g, '/').split('/')
    const filename = parts[parts.length - 1] || filePath
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'code-file',
      title: filename,
      filePath,
      projectId,
      hostId,
      dirty: false
    }
    this._addTab(tab)
  }

  openLocalTerminalTab(projectPath: string, projectName: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'local-terminal' && t.filePath === projectPath
    )
    if (existing) {
      this._focusTab(existing.id)
      return
    }
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'local-terminal',
      title: `Terminal: ${projectName}`,
      filePath: projectPath
    }
    this._addTab(tab)
  }

  openSshTerminalTab(hostId: string, hostName: string) {
    const existing = this.state.tabs.find(
      (t) => t.type === 'ssh-terminal' && t.hostId === hostId
    )
    if (existing) {
      this._focusTab(existing.id)
      return
    }
    const tab: CenterTab = {
      id: crypto.randomUUID(),
      type: 'ssh-terminal',
      title: `SSH: ${hostName}`,
      hostId
    }
    this._addTab(tab)
  }

  private _addTab(tab: CenterTab) {
    this.setState((s) => {
      s.tabs.push(tab)
      // Add to focused group
      let group = this.findGroup(s.focusedGroupId)
      if (!group) {
        // Fallback: find first group
        const groups = this.allGroups
        group = groups[0] || null
        if (group) s.focusedGroupId = group.id
      }
      if (group) {
        group.tabIds.push(tab.id)
        group.activeTabId = tab.id
      }
      s.activeTabId = tab.id
    })
    this.scheduleLayoutSave()
  }

  private _focusTab(tabId: string) {
    this.setState((s) => {
      const group = this.findGroupForTab(tabId)
      if (group) {
        group.activeTabId = tabId
        s.focusedGroupId = group.id
      }
      s.activeTabId = tabId
    })
  }

  // ─── Close methods ───

  closeTab(id: string) {
    this.setState((s) => {
      const tabIndex = s.tabs.findIndex((t) => t.id === id)
      if (tabIndex < 0) return

      // Save to closed history for reopen
      const closedTab = { ...s.tabs[tabIndex] }
      this._closedTabs.push(closedTab)
      if (this._closedTabs.length > this.MAX_CLOSED) {
        this._closedTabs.shift()
      }

      const group = this.findGroupForTab(id)
      if (group) {
        const idx = group.tabIds.indexOf(id)
        if (idx >= 0) group.tabIds.splice(idx, 1)

        // Update group's active tab
        if (group.activeTabId === id) {
          if (group.tabIds.length === 0) {
            group.activeTabId = null
          } else if (idx < group.tabIds.length) {
            group.activeTabId = group.tabIds[idx]
          } else {
            group.activeTabId = group.tabIds[group.tabIds.length - 1]
          }
        }

        // If group is empty, collapse it
        if (group.tabIds.length === 0) {
          this._removeEmptyGroup(group.id)
          // Focus another group if this was focused
          if (s.focusedGroupId === group.id) {
            const remaining = this.allGroups.filter((g) => g.tabIds.length > 0)
            if (remaining.length > 0) {
              s.focusedGroupId = remaining[0].id
            }
          }
        }
      }

      // Remove from flat list
      s.tabs.splice(tabIndex, 1)
      this.syncActiveTabId()
    })
    this.scheduleLayoutSave()
  }

  closeOtherTabs(keepId: string) {
    this.setState((s) => {
      const keepTab = s.tabs.find((t) => t.id === keepId)
      if (!keepTab) return

      // Remove all tabs except keepId
      s.tabs = [keepTab]

      // Reset layout to single group with just this tab
      s.root = {
        type: 'tab-group',
        id: DEFAULT_GROUP_ID,
        tabIds: [keepId],
        activeTabId: keepId
      }
      s.focusedGroupId = DEFAULT_GROUP_ID
      s.activeTabId = keepId
    })
    this.scheduleLayoutSave()
  }

  closeTabsToTheRight(id: string) {
    const group = this.findGroupForTab(id)
    if (!group) return
    const idx = group.tabIds.indexOf(id)
    if (idx < 0) return

    this.setState((s) => {
      const toRemove = group.tabIds.slice(idx + 1)
      group.tabIds = group.tabIds.slice(0, idx + 1)

      // Remove from flat list
      s.tabs = s.tabs.filter((t) => !toRemove.includes(t.id))

      if (group.activeTabId && toRemove.includes(group.activeTabId)) {
        group.activeTabId = id
      }
      this.syncActiveTabId()
    })
    this.scheduleLayoutSave()
  }

  closeAllTabs() {
    this.setState((s) => {
      s.tabs = []
      s.activeTabId = null
      s.root = makeDefaultRoot()
      s.focusedGroupId = DEFAULT_GROUP_ID
    })
    this.scheduleLayoutSave()
  }

  reopenLastClosedTab() {
    const tab = this._closedTabs.pop()
    if (!tab) return
    // Give it a new ID to avoid conflicts
    tab.id = crypto.randomUUID()
    this._addTab(tab)
  }

  // ─── Selection & movement ───

  selectTab(id: string) {
    this._focusTab(id)
  }

  moveTab(fromIndex: number, toIndex: number) {
    // This is for within-group reorder in the focused group
    const group = this.focusedGroup
    if (!group || fromIndex === toIndex) return
    this.setState(() => {
      const [tabId] = group.tabIds.splice(fromIndex, 1)
      const target = fromIndex < toIndex ? toIndex - 1 : toIndex
      group.tabIds.splice(target, 0, tabId)
    })
    this.scheduleLayoutSave()
  }

  moveTabInGroup(groupId: string, fromIndex: number, toIndex: number) {
    const group = this.findGroup(groupId)
    if (!group || fromIndex === toIndex) return
    this.setState(() => {
      const [tabId] = group.tabIds.splice(fromIndex, 1)
      const target = fromIndex < toIndex ? toIndex - 1 : toIndex
      group.tabIds.splice(target, 0, tabId)
    })
    this.scheduleLayoutSave()
  }

  // ─── Tab metadata updates ───

  updateTabTitle(id: string, title: string) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (tab) tab.title = title
    })
  }

  setTabAttention(id: string, attention: boolean) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (tab) tab.attention = attention
    })
  }

  setTabAttentionBySessionId(sessionId: string, attention: boolean) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.type === 'session' && t.sessionId === sessionId)
      if (tab) tab.attention = attention
    })
  }

  setTabBorderColor(id: string, color: string | undefined) {
    this.setState((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (tab) tab.borderColor = color
    })
    this.scheduleLayoutSave()
  }

  // ─── Split / Merge operations ───

  splitGroup(
    groupId: string,
    direction: SplitDirection,
    position: 'before' | 'after' = 'after'
  ): string | null {
    const group = this.findGroup(groupId)
    if (!group) return null

    const newGroupId = crypto.randomUUID()
    const newGroup: LayoutTabGroup = {
      type: 'tab-group',
      id: newGroupId,
      tabIds: [],
      activeTabId: null
    }

    this.setState((s) => {
      // Deep copy the group to avoid shared MobX observable references
      const groupCopy: LayoutTabGroup = {
        type: 'tab-group',
        id: group.id,
        tabIds: [...group.tabIds],
        activeTabId: group.activeTabId
      }
      const splitNode: LayoutSplitNode = {
        type: 'split',
        id: crypto.randomUUID(),
        direction,
        children:
          position === 'after' ? [groupCopy, newGroup] : [newGroup, groupCopy],
        sizes: [0.5, 0.5]
      }

      // Replace the group in the tree with the split node
      if (s.root.id === groupId) {
        s.root = splitNode
      } else {
        const parentInfo = this.findParent(groupId)
        if (parentInfo) {
          parentInfo.parent.children[parentInfo.index] = splitNode
        }
      }
    })
    this.scheduleLayoutSave()
    return newGroupId
  }

  moveTabToGroup(tabId: string, targetGroupId: string, index?: number) {
    this.setState((s) => {
      const sourceGroup = this.findGroupForTab(tabId)
      const targetGroup = this.findGroup(targetGroupId)
      if (!sourceGroup || !targetGroup) return
      if (sourceGroup.id === targetGroupId) return

      // Remove from source
      const srcIdx = sourceGroup.tabIds.indexOf(tabId)
      if (srcIdx >= 0) sourceGroup.tabIds.splice(srcIdx, 1)

      // Update source active tab
      if (sourceGroup.activeTabId === tabId) {
        sourceGroup.activeTabId = sourceGroup.tabIds[0] || null
      }

      // Add to target
      if (index !== undefined) {
        targetGroup.tabIds.splice(index, 0, tabId)
      } else {
        targetGroup.tabIds.push(tabId)
      }
      targetGroup.activeTabId = tabId

      // Focus target group
      s.focusedGroupId = targetGroupId

      // Clean up empty source group
      if (sourceGroup.tabIds.length === 0) {
        this._removeEmptyGroup(sourceGroup.id)
      }

      this.syncActiveTabId()
    })
    this.scheduleLayoutSave()
  }

  moveTabToNewSplit(
    tabId: string,
    targetGroupId: string,
    zone: DropZone
  ) {
    if (zone === 'center') {
      this.moveTabToGroup(tabId, targetGroupId)
      return
    }

    const direction: SplitDirection =
      zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
    const position = zone === 'left' || zone === 'top' ? 'before' : 'after'

    // Create the split first
    const newGroupId = this.splitGroup(targetGroupId, direction, position)
    if (!newGroupId) return

    // Move the tab to the new group
    this.moveTabToGroup(tabId, newGroupId)
  }

  // Wrap the entire root in a new split, adding a new empty group on one side.
  // Used when dropping a tab on the outer edge of the whole layout.
  splitRootWithTab(tabId: string, zone: DropZone) {
    if (zone === 'center') return

    const direction: SplitDirection =
      zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
    const position = zone === 'left' || zone === 'top' ? 'before' : 'after'

    const newGroupId = crypto.randomUUID()
    const newGroup: LayoutTabGroup = {
      type: 'tab-group',
      id: newGroupId,
      tabIds: [],
      activeTabId: null
    }

    this.setState((s) => {
      // Deep-copy current root to avoid MobX reference issues
      const oldRoot = JSON.parse(JSON.stringify(s.root)) as LayoutNode
      const splitNode: LayoutSplitNode = {
        type: 'split',
        id: crypto.randomUUID(),
        direction,
        children: position === 'after' ? [oldRoot, newGroup] : [newGroup, oldRoot],
        sizes: [0.5, 0.5]
      }
      s.root = splitNode
    })

    this.moveTabToGroup(tabId, newGroupId)
    this.scheduleLayoutSave()
  }

  resizeSplit(splitId: string, sizes: number[]) {
    this.setState(() => {
      const search = (node: LayoutNode): boolean => {
        if (node.type === 'split' && node.id === splitId) {
          node.sizes = sizes
          return true
        }
        if (node.type === 'split') {
          for (const child of node.children) {
            if (search(child)) return true
          }
        }
        return false
      }
      search(this.state.root)
    })
    this.scheduleLayoutSave()
  }

  focusGroup(groupId: string) {
    this.setState((s) => {
      s.focusedGroupId = groupId
      const group = this.findGroup(groupId)
      if (group) {
        s.activeTabId = group.activeTabId
      }
    })
  }

  selectTabInGroup(groupId: string, tabId: string) {
    this.setState((s) => {
      const group = this.findGroup(groupId)
      if (group) {
        group.activeTabId = tabId
        s.focusedGroupId = groupId
        s.activeTabId = tabId
      }
    })
  }

  getGroupTabs(groupId: string): CenterTab[] {
    const group = this.findGroup(groupId)
    if (!group) return []
    return group.tabIds
      .map((id) => this.state.tabs.find((t) => t.id === id))
      .filter(Boolean) as CenterTab[]
  }

  // ─── Internal: remove empty group and collapse parent split ───

  private _removeEmptyGroup(groupId: string) {
    const root = this.state.root
    if (root.type === 'tab-group' && root.id === groupId) {
      // Root is the empty group — reset to default
      return
    }

    const parentInfo = this.findParent(groupId)
    if (!parentInfo) return

    const { parent, index: childIndex } = parentInfo
    parent.children.splice(childIndex, 1)
    parent.sizes.splice(childIndex, 1)

    // Normalize remaining sizes
    if (parent.sizes.length > 0) {
      const total = parent.sizes.reduce((a, b) => a + b, 0)
      parent.sizes = parent.sizes.map((s) => s / total)
    }

    // If split has only one child left, replace split with that child
    if (parent.children.length === 1) {
      const survivor = parent.children[0]
      const grandParentInfo = this.findParent(parent.id)
      if (grandParentInfo) {
        grandParentInfo.parent.children[grandParentInfo.index] = survivor
      } else if (this.state.root.id === parent.id) {
        this.state.root = survivor
      }
    }
  }

  // ─── Layout persistence ───

  restoreLayout() {
    const saved = this.store.settings.state.claudeCodeLayout
    if (!saved || typeof saved !== 'object') return

    try {
      const isValidNode = (n: any): boolean => {
        if (!n || typeof n !== 'object') return false
        if (n.type === 'tab-group') return Array.isArray(n.tabIds) && typeof n.id === 'string'
        if (n.type === 'split')
          return (
            Array.isArray(n.children) &&
            Array.isArray(n.sizes) &&
            n.children.every(isValidNode)
          )
        return false
      }

      if (isValidNode(saved)) {
        this.setState((s) => {
          s.root = saved as LayoutNode
          // Find first group with tabs as focused
          const groups = this.allGroups
          const withTabs = groups.find((g) => g.tabIds.length > 0)
          if (withTabs) {
            s.focusedGroupId = withTabs.id
            s.activeTabId = withTabs.activeTabId
          }
        })
      }
    } catch {
      // Invalid layout, keep default
    }
  }
}
