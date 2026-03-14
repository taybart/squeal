import { createSignal, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"

export interface DbConnection {
  id: number
  name: string
  db_type: string
  connection_string: string
  created_at: string
}

export interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  default_value: string | null
  is_primary_key: boolean
}

export function useConnections() {
  const [connections, setConnections] = createSignal<DbConnection[]>([])
  const [selectedConnection, setSelectedConnection] = createSignal<number | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [pendingSavedId, setPendingSavedId] = createSignal<number | null>(null)

  // Load saved connection from localStorage synchronously on init
  const savedId = localStorage.getItem('selectedConnectionId')
  if (savedId) {
    const id = parseInt(savedId, 10)
    if (!isNaN(id)) {
      setPendingSavedId(id)
    }
  }

  // Save selected connection to localStorage when it changes
  const saveSelectedConnection = (id: number | null) => {
    setSelectedConnection(id)
    if (id !== null) {
      localStorage.setItem('selectedConnectionId', id.toString())
    } else {
      localStorage.removeItem('selectedConnectionId')
    }
  }

  const loadConnections = async () => {
    setIsLoading(true)
    try {
      const result = await invoke<DbConnection[]>("list_connections")
      setConnections(result)
      
      // Restore saved connection if it still exists
      const pendingId = pendingSavedId()
      if (pendingId !== null) {
        const stillExists = result.some(conn => conn.id === pendingId)
        if (stillExists) {
          setSelectedConnection(pendingId)
        }
        setPendingSavedId(null)
      }
      
      setError(null)
    } catch (e) {
      setError(`Failed to load connections: ${e}`)
    } finally {
      setIsLoading(false)
    }
  }

  const addConnection = async (
    name: string,
    dbType: string,
    connectionString: string
  ): Promise<boolean> => {
    try {
      await invoke("add_connection", {
        name,
        dbType,
        connectionString,
      })
      await loadConnections()
      return true
    } catch (e) {
      setError(`Failed to add connection: ${e}`)
      return false
    }
  }

  const deleteConnection = async (id: number): Promise<boolean> => {
    try {
      await invoke("delete_connection", { id })
      await loadConnections()
      if (selectedConnection() === id) {
        saveSelectedConnection(null)
      }
      return true
    } catch (e) {
      setError(`Failed to delete connection: ${e}`)
      return false
    }
  }

  const testConnection = async (dbType: string, connectionString: string): Promise<boolean> => {
    try {
      await invoke("test_connection", {
        dbType,
        connectionString,
      })
      return true
    } catch (e) {
      setError(`Connection test failed: ${e}`)
      return false
    }
  }

  const executeSql = async (connectionId: number, sql: string): Promise<any> => {
    try {
      const result = await invoke("execute_sql", {
        connectionId,
        sql,
      })
      return result
    } catch (e) {
      setError(`Query failed: ${e}`)
      throw e
    }
  }

  const listTables = async (connectionId: number): Promise<string[]> => {
    try {
      const result = await invoke<string[]>("list_tables", { connectionId })
      return result
    } catch (e) {
      setError(`Failed to list tables: ${e}`)
      return []
    }
  }

  const getTableSchema = async (connectionId: number, tableName: string): Promise<ColumnInfo[]> => {
    try {
      const result = await invoke<ColumnInfo[]>("get_table_schema", { 
        connectionId, 
        tableName 
      })
      return result
    } catch (e) {
      setError(`Failed to get table schema: ${e}`)
      return []
    }
  }

  const updateRow = async (
    connectionId: number,
    tableName: string,
    columnName: string,
    newValue: any,
    primaryKeyColumn: string,
    primaryKeyValue: any
  ): Promise<{ rows_affected: number }> => {
    try {
      const result = await invoke<{ rows_affected: number }>("update_row", {
        connectionId,
        tableName,
        columnName,
        newValue,
        primaryKeyColumn,
        primaryKeyValue,
      })
      return result
    } catch (e) {
      setError(`Update failed: ${e}`)
      throw e
    }
  }

  // Load connections on mount
  createEffect(() => {
    loadConnections()
  })

  return {
    connections,
    selectedConnection,
    setSelectedConnection: saveSelectedConnection,
    isLoading,
    error,
    loadConnections,
    addConnection,
    deleteConnection,
    testConnection,
    executeSql,
    listTables,
    getTableSchema,
    updateRow,
  }
}
