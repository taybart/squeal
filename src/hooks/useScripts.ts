import { createSignal, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { debugLog, debugError } from "~/utils/debug"

export interface Script {
  id: number
  name: string
  connection_id: number | null
  folder_path: string
  is_production: boolean
  cursor_position: string
  last_modified: string | null
  created_at: string
}

export interface BufferTab {
  id: number
  buffer_id: number | null
  script_id: number | null
  name: string
  file_path: string
  connection_id: number | null
  is_modified: boolean
  is_active: boolean
}

export interface AppState {
  id: number
  active_connection_id: number | null
  open_tabs_json: string | null
  active_tab_index: number
  show_debug_panel: boolean
  show_scripts_panel: boolean
  show_explorer_panel: boolean
}

export function useScripts(connected: () => boolean) {
  const [scripts, setScripts] = createSignal<Script[]>([])
  const [tabs, setTabs] = createSignal<BufferTab[]>([])
  const [activeTabId, setActiveTabId] = createSignal<number | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // Load tabs from backend
  const loadTabs = async () => {
    if (!connected()) return
    
    try {
      const tabsData = await invoke<BufferTab[]>("get_tabs")
      setTabs(tabsData)
      
      // Set active tab
      const activeTab = tabsData.find(t => t.is_active)
      if (activeTab) {
        setActiveTabId(activeTab.id)
      } else if (tabsData.length > 0) {
        setActiveTabId(tabsData[0].id)
      }
    } catch (e) {
      debugError("Scripts", "Failed to load tabs:", e)
    }
  }

  // Create a new tab
  const createTab = async (name: string, filePath: string, connectionId?: number | null) => {
    if (!connected()) return null
    
    try {
      const newTab = await invoke<BufferTab>("create_new_tab", {
        name,
        filePath
      })
      
      // Set connection if provided
      if (connectionId !== undefined && connectionId !== null) {
        await updateTabConnection(newTab.id, connectionId)
        newTab.connection_id = connectionId
      }
      
      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
      
      // Save app state after creating tab
      await saveCurrentState()
      
      return newTab
    } catch (e) {
      setError(`Failed to create tab: ${e}`)
      return null
    }
  }

  // Switch to a tab
  const switchTab = async (tabId: number) => {
    if (!connected()) return
    
    try {
      const filePath = await invoke<string>("switch_tab", { tabId })
      
      // Update local state
      setTabs(prev => prev.map(t => ({
        ...t,
        is_active: t.id === tabId
      })))
      setActiveTabId(tabId)
      
      // Save app state after switching tab
      await saveCurrentState()
      
      return filePath
    } catch (e) {
      setError(`Failed to switch tab: ${e}`)
      return null
    }
  }

  // Close a tab
  const closeTab = async (tabId: number) => {
    if (!connected()) return
    
    try {
      const result = await invoke<[number, string] | null>("close_tab", { tabId })
      
      // Update local state
      setTabs(prev => prev.filter(t => t.id !== tabId))
      
      // If a new tab was activated, update the active tab
      if (result) {
        const [newId, newPath] = result
        setActiveTabId(newId)
        return newPath
      } else if (tabs().length > 1) {
        // Find the first remaining tab
        const remainingTabs = tabs().filter(t => t.id !== tabId)
        if (remainingTabs.length > 0) {
          setActiveTabId(remainingTabs[0].id)
        } else {
          setActiveTabId(null)
        }
      } else {
        setActiveTabId(null)
      }
      
      // Sync scripts after closing tab to keep scripts pane in sync
      await syncScriptsWithDb()
      
      // Save app state after closing tab
      await saveCurrentState()
      
      return null
    } catch (e) {
      setError(`Failed to close tab: ${e}`)
      return null
    }
  }

  // Load scripts for a connection
  const loadScripts = async (connectionId?: number) => {
    setIsLoading(true)
    try {
      const scriptsData = await invoke<Script[]>("list_scripts", {
        connectionId: connectionId ?? null
      })
      setScripts(scriptsData)
      setError(null)
    } catch (e) {
      setError(`Failed to load scripts: ${e}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Create a new script
  const createScript = async (
    name: string,
    connectionId: number | null,
    folderPath: string
  ): Promise<Script | null> => {
    try {
      const script = await invoke<Script>("create_script", {
        name,
        connectionId,
        folderPath
      })
      setScripts(prev => [script, ...prev])
      return script
    } catch (e) {
      setError(`Failed to create script: ${e}`)
      return null
    }
  }

  // Create a new script file
  const createScriptFile = async (
    name: string,
    connectionId: number | null,
    folderPath: string,
    initialContent?: string
  ): Promise<Script | null> => {
    try {
      const script = await invoke<Script>("create_script_file", {
        name,
        connectionId,
        folderPath,
        initialContent: initialContent ?? "",
      })
      setScripts(prev => [script, ...prev])
      return script
    } catch (e) {
      setError(`Failed to create script file: ${e}`)
      return null
    }
  }

  // Read script file content
  const readScriptFile = async (scriptId: number): Promise<string | null> => {
    try {
      const content = await invoke<string>("read_script_file", { scriptId })
      return content
    } catch (e) {
      setError(`Failed to read script file: ${e}`)
      return null
    }
  }

  // Delete script file
  const deleteScriptFile = async (scriptId: number) => {
    try {
      await invoke("delete_script_file", { scriptId })
      setScripts(prev => prev.filter(s => s.id !== scriptId))
    } catch (e) {
      setError(`Failed to delete script file: ${e}`)
    }
  }

  // Write script file content
  const writeScriptFile = async (scriptId: number, content: string) => {
    try {
      await invoke("write_script_file", { scriptId, content })
    } catch (e) {
      setError(`Failed to write script file: ${e}`)
    }
  }

  // Delete a script
  const deleteScript = async (scriptId: number) => {
    try {
      await invoke("delete_script", { id: scriptId })
      setScripts(prev => prev.filter(s => s.id !== scriptId))
    } catch (e) {
      setError(`Failed to delete script: ${e}`)
    }
  }

  // Update tab connection
  const updateTabConnection = async (tabId: number, connectionId: number | null) => {
    if (!connected()) return
    
    try {
      await invoke("update_tab_connection", { tabId, connectionId })
      
      // Update local state
      setTabs(prev => prev.map(t => 
        t.id === tabId ? { ...t, connection_id: connectionId } : t
      ))
      
      // Save app state after updating connection
      await saveCurrentState()
    } catch (e) {
      setError(`Failed to update tab connection: ${e}`)
    }
  }

  // Get app state
  const getAppState = async (): Promise<AppState | null> => {
    try {
      return await invoke<AppState>("get_app_state")
    } catch (e) {
      debugError("Scripts", "Failed to get app state:", e)
      return null
    }
  }

  // Save app state
  const saveAppState = async (
    activeConnectionId: number | null,
    openTabs: BufferTab[],
    activeTabIndex: number,
    showDebugPanel: boolean = false,
    showScriptsPanel: boolean = false,
    showExplorerPanel: boolean = false,
    theme?: string | null
  ) => {
    try {
      await invoke("save_app_state", {
        activeConnectionId,
        openTabsJson: JSON.stringify(openTabs),
        activeTabIndex,
        showDebugPanel,
        showScriptsPanel,
        showExplorerPanel,
        theme
      })
    } catch (e) {
      debugError("Scripts", "Failed to save app state:", e)
    }
  }

  // Helper to save current state
  const saveCurrentState = async (
    showDebugPanel: boolean = false,
    showScriptsPanel: boolean = false,
    showExplorerPanel: boolean = false,
    theme?: string | null
  ) => {
    const currentTabs = tabs()
    const activeId = activeTabId()
    const activeIndex = currentTabs.findIndex(t => t.id === activeId)
    
    await saveAppState(
      currentTabs.find(t => t.is_active)?.connection_id ?? null,
      currentTabs,
      activeIndex >= 0 ? activeIndex : 0,
      showDebugPanel,
      showScriptsPanel,
      showExplorerPanel,
      theme
    )
  }

  // Restore tabs from saved state
  const restoreTabs = async () => {
    if (!connected()) return
    
    try {
      const appState = await getAppState()
      if (!appState || !appState.open_tabs_json) {
        // No saved state, just load default tabs (which includes scratch)
        await loadTabs()
        return
      }
      
      // Parse saved tabs
      const savedTabs: BufferTab[] = JSON.parse(appState.open_tabs_json)
      if (savedTabs.length === 0) {
        // No saved tabs, just load default tabs (which includes scratch)
        await loadTabs()
        return
      }
      
      debugLog("Scripts", "Restoring", savedTabs.length, "tabs from saved state")
      debugLog("Saved tabs:", savedTabs.map(t => ({ name: t.name, path: t.file_path, connection: t.connection_id })))
      
      // Get current tabs before restoring (this will include the scratch tab)
      const initialTabs = await invoke<BufferTab[]>("get_tabs")
      debugLog("Initial tabs before restore:", initialTabs.map(t => ({ id: t.id, name: t.name })))
      const scratchTab = initialTabs.find(t => t.name === "scratch" || t.name === "scratch.sql")
      
      // Restore each tab
      const restoredTabIds: number[] = []
      for (const savedTab of savedTabs) {
        try {
          // Check if file exists
          const fileExists = await invoke<boolean>("file_exists", { 
            path: savedTab.file_path 
          })
          
          if (fileExists) {
            debugLog("Restoring tab:", savedTab.name, "from", savedTab.file_path)
            // Create tab and set connection
            const newTab = await invoke<BufferTab>("create_new_tab", {
              name: savedTab.name,
              filePath: savedTab.file_path
            })
            
            if (savedTab.connection_id) {
              await updateTabConnection(newTab.id, savedTab.connection_id)
            }
            restoredTabIds.push(newTab.id)
          } else {
            debugLog("Skipping restore - file doesn't exist:", savedTab.file_path)
          }
        } catch (e) {
          debugError("Failed to restore tab:", savedTab.name, e)
        }
      }
      
      debugLog("Restored", restoredTabIds.length, "tabs with IDs:", restoredTabIds)
      
      // Reload tabs from backend to get updated state
      await loadTabs()
      
      // Get fresh tabs list
      const finalTabs = await invoke<BufferTab[]>("get_tabs")
      debugLog("Final tabs after restore:", finalTabs.map(t => ({ id: t.id, name: t.name, active: t.is_active })))
      
      // If we successfully restored any tabs and there's a scratch tab, close it
      if (restoredTabIds.length > 0 && scratchTab) {
        try {
          // Check if scratch tab still exists
          const scratchStillExists = finalTabs.some(t => t.id === scratchTab.id)
          if (scratchStillExists) {
            debugLog("Closing scratch tab:", scratchTab.id)
            // Close scratch tab directly without triggering state saves
            await invoke("close_tab", { tabId: scratchTab.id })
            debugLog("Closed scratch tab after restoring saved tabs")
            // Reload to get final state
            await loadTabs()
          }
        } catch (e) {
          debugError("Failed to close scratch tab:", e)
        }
      }
      
      // Restore active tab - try to find the tab that was active by name
      const activeTabName = savedTabs[appState.active_tab_index]?.name
      if (activeTabName) {
        const currentTabs = await invoke<BufferTab[]>("get_tabs")
        const activeTab = currentTabs.find(t => t.name === activeTabName)
        if (activeTab) {
          debugLog("Restoring active tab:", activeTab.name, "(ID:", activeTab.id, ")")
          const filePath = await switchTab(activeTab.id)
          if (filePath) {
            debugLog("Opening file in nvim:", filePath)
            await invoke("open_file_path", { filePath })
          }
        } else {
          debugLog("Could not find active tab by name, activating first tab")
          // Fall back to activating first tab
          if (currentTabs.length > 0) {
            const filePath = await switchTab(currentTabs[0].id)
            if (filePath) {
              await invoke("open_file_path", { filePath })
            }
          }
        }
      }
    } catch (e) {
      debugError("Failed to restore tabs:", e)
      // Fall back to default load
      await loadTabs()
    }
  }

  // Sync filesystem scripts with database
  const syncScriptsWithDb = async (): Promise<Script[]> => {
    debugLog("Starting syncScriptsWithDb...")
    try {
      const syncedScripts = await invoke<Script[]>("sync_scripts_with_db")
      debugLog("Sync complete, got", syncedScripts.length, "scripts")
      setScripts(syncedScripts)
      return syncedScripts
    } catch (e) {
      debugError("Failed to sync scripts:", e)
      setError(`Failed to sync scripts: ${e}`)
      return []
    }
  }

  // Load tabs when connected - try to restore saved state first
  createEffect(() => {
    if (connected()) {
      restoreTabs()
    }
  })

  return {
    scripts,
    tabs,
    activeTabId,
    isLoading,
    error,
    loadTabs,
    createTab,
    switchTab,
    closeTab,
    loadScripts,
    createScript,
    deleteScript,
    createScriptFile,
    readScriptFile,
    deleteScriptFile,
    writeScriptFile,
    syncScriptsWithDb,
    updateTabConnection,
    getAppState,
    saveAppState,
    saveCurrentState,
    restoreTabs
  }
}