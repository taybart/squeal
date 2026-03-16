// Debug logger with on/off toggle
// All debug logs should go through this to avoid console spam

const DEBUG_KEY = 'squeal_debug_enabled'

// Check if debug mode is enabled (default: false)
export const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(DEBUG_KEY) === 'true'
}

// Enable/disable debug mode
export const setDebugEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(DEBUG_KEY, enabled ? 'true' : 'false')
}

// Toggle debug mode
export const toggleDebug = (): boolean => {
  const newState = !isDebugEnabled()
  setDebugEnabled(newState)
  return newState
}

// Debug log function - only logs when debug is enabled
export const debugLog = (prefix: string, ...args: any[]): void => {
  if (!isDebugEnabled()) return
  console.log(`[${prefix}]`, ...args)
}

// Debug error function - only logs when debug is enabled
export const debugError = (prefix: string, ...args: any[]): void => {
  if (!isDebugEnabled()) return
  console.error(`[${prefix}]`, ...args)
}

// Debug warn function - only logs when debug is enabled
export const debugWarn = (prefix: string, ...args: any[]): void => {
  if (!isDebugEnabled()) return
  console.warn(`[${prefix}]`, ...args)
}
