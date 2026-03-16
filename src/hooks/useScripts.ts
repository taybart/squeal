import { createSignal, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"

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
      console.error("Failed to load tabs:", e)
    }
  }

  // Create a new tab
  const createTab = async (name: string, filePath: string) => {
    if (!connected()) return null
    
    try {
      const newTab = await invoke<BufferTab>("create_new_tab", {
        name,
        filePath
      })
      
      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
      
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
    } catch (e) {
      setError(`Failed to update tab connection: ${e}`)
    }
  }

  // Get app state
  const getAppState = async (): Promise<AppState | null> => {
    try {
      return await invoke<AppState>("get_app_state")
    } catch (e) {
      console.error("Failed to get app state:", e)
      return null
    }
  }

  // Save app state
  const saveAppState = async (
    activeConnectionId: number | null,
    openTabs: BufferTab[],
    activeTabIndex: number
  ) => {
    try {
      await invoke("save_app_state", {
        activeConnectionId,
        openTabsJson: JSON.stringify(openTabs),
        activeTabIndex
      })
    } catch (e) {
      console.error("Failed to save app state:", e)
    }
  }

  // Sync filesystem scripts with database
  const syncScriptsWithDb = async (): Promise<Script[]> => {
    console.log("Starting syncScriptsWithDb...")
    try {
      const syncedScripts = await invoke<Script[]>("sync_scripts_with_db")
      console.log("Sync complete, got", syncedScripts.length, "scripts")
      setScripts(syncedScripts)
      return syncedScripts
    } catch (e) {
      console.error("Failed to sync scripts:", e)
      setError(`Failed to sync scripts: ${e}`)
      return []
    }
  }

  // Load tabs when connected
  createEffect(() => {
    if (connected()) {
      loadTabs()
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
    saveAppState
  }
}