import { createSignal, createEffect } from "solid-js"
import { invoke } from "@tauri-apps/api/core"
import { emit, listen } from "@tauri-apps/api/event"
import { useColorMode } from "@kobalte/core"

export type Theme = "light" | "dark" | "system"

export function useTheme() {
  const [theme, setThemeState] = createSignal<Theme>("system")
  const [isLoading, setIsLoading] = createSignal(false)
  const [customThemeStyles, setCustomThemeStyles] = createSignal<{ light: Record<string, string>; dark: Record<string, string> } | null>(null)
  const { setColorMode } = useColorMode()

  // Load theme from database on mount
  const loadTheme = async () => {
    setIsLoading(true)
    try {
      const result = await invoke<{ theme?: string; theme_css?: string; theme_json?: string }>("get_app_state")
      const savedTheme = result.theme as Theme | undefined
      if (savedTheme && ["light", "dark", "system"].includes(savedTheme)) {
        setThemeState(savedTheme)
        applyTheme(savedTheme)
      }
      
      // Load custom theme if exists
      if (result.theme_css || result.theme_json) {
        await loadCustomTheme(result.theme_css, result.theme_json)
      }
    } catch (e) {
      console.error("Failed to load theme:", e)
    } finally {
      setIsLoading(false)
    }
  }

  // Parse and load custom theme
  const loadCustomTheme = async (themeCss?: string, themeJson?: string) => {
    try {
      let styles: { light: Record<string, string>; dark: Record<string, string> } = { light: {}, dark: {} }
      
      if (themeCss) {
        // Convert .dark to [data-kb-theme="dark"] and parse both blocks
        const normalizedCss = themeCss.replace(/\.dark\s*\{/g, '[data-kb-theme="dark"] {')
        
        // Parse :root block (light mode)
        const rootMatch = normalizedCss.match(/:root\s*{([^}]*)}/)
        if (rootMatch) {
          const content = rootMatch[1]
          const varRegex = /--([^:]+):\s*([^;]+)/g
          let match
          while ((match = varRegex.exec(content)) !== null) {
            const [, name, value] = match
            styles.light[`--${name.trim()}`] = value.trim()
          }
        }
        
        // Parse [data-kb-theme="dark"] block (dark mode)
        const darkMatch = normalizedCss.match(/\[data-kb-theme="dark"\]\s*{([^}]*)}/)
        if (darkMatch) {
          const content = darkMatch[1]
          const varRegex = /--([^:]+):\s*([^;]+)/g
          let match
          while ((match = varRegex.exec(content)) !== null) {
            const [, name, value] = match
            styles.dark[`--${name.trim()}`] = value.trim()
          }
        }
      } else if (themeJson) {
        try {
          const parsed = JSON.parse(themeJson)
          if (parsed.light && parsed.dark) {
            styles = parsed
          } else {
            styles = { light: parsed, dark: {} }
          }
        } catch (e) {
          console.error("Failed to parse theme JSON:", e)
        }
      }
      
      if (Object.keys(styles.light).length > 0 || Object.keys(styles.dark).length > 0) {
        setCustomThemeStyles(styles)
        applyCustomTheme(styles)
      }
    } catch (e) {
      console.error("Failed to load custom theme:", e)
    }
  }

  // Apply custom CSS variables based on current mode
  const applyCustomTheme = (styles: { light: Record<string, string>; dark: Record<string, string> }) => {
    const root = document.documentElement
    const isDark = root.classList.contains('dark') || 
                   root.getAttribute('data-kb-theme') === 'dark'
    
    // Remove old custom theme vars
    const allVars = Array.from(root.style)
    allVars.forEach(v => {
      if (v.startsWith('--')) {
        root.style.removeProperty(v)
      }
    })
    
    // Apply appropriate theme
    const themeToApply = isDark ? styles.dark : styles.light
    if (Object.keys(themeToApply).length > 0) {
      Object.entries(themeToApply).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    } else if (isDark && Object.keys(styles.light).length > 0) {
      // Fallback to light vars if no dark vars defined
      Object.entries(styles.light).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    }
  }

  // Apply theme to document and sync with kobalte
  const applyTheme = (newTheme: Theme) => {
    const html = document.documentElement
    
    // Sync with kobalte's color mode system
    if (newTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setColorMode(prefersDark ? "dark" : "light")
    } else {
      setColorMode(newTheme)
    }
    
    // Also apply data-kb-theme for CSS selectors
    if (newTheme === "system") {
      html.removeAttribute("data-kb-theme")
      
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      if (prefersDark) {
        html.classList.add("dark")
        html.classList.remove("light")
      } else {
        html.classList.add("light")
        html.classList.remove("dark")
      }
    } else {
      html.setAttribute("data-kb-theme", newTheme)
      if (newTheme === "dark") {
        html.classList.add("dark")
        html.classList.remove("light")
      } else {
        html.classList.add("light")
        html.classList.remove("dark")
      }
    }
    
    // Re-apply custom theme if exists (to switch between light/dark vars)
    const customStyles = customThemeStyles()
    if (customStyles) {
      applyCustomTheme(customStyles)
    }
  }

  // Set theme and save to database
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
    
    try {
      // Save to database
      const themeValue = newTheme === "system" ? null : newTheme
      await invoke("set_theme", { theme: themeValue })
      
      // Emit event to other windows
      await emit("theme-changed", { theme: newTheme })
    } catch (e) {
      console.error("Failed to save theme:", e)
    }
  }

  // Listen for theme changes from other windows
  createEffect(() => {
    const unlisten = listen<{ theme: Theme }>("theme-changed", (event) => {
      const newTheme = event.payload.theme
      setThemeState(newTheme)
      applyTheme(newTheme)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  // Listen for custom theme changes from other windows
  createEffect(() => {
    const unlisten = listen<{ light: Record<string, string>; dark: Record<string, string> }>("custom-theme-applied", (event) => {
      setCustomThemeStyles(event.payload)
      applyCustomTheme(event.payload)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  // Listen for custom theme clear from other windows
  createEffect(() => {
    const unlisten = listen("custom-theme-cleared", () => {
      const root = document.documentElement
      const allVars = Array.from(root.style)
      allVars.forEach(v => {
        if (v.startsWith('--')) {
          root.style.removeProperty(v)
        }
      })
      setCustomThemeStyles(null)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  })

  // Listen for system theme changes when in system mode
  createEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    
    const handleChange = () => {
      if (theme() === "system") {
        applyTheme("system")
      }
    }
    
    mediaQuery.addEventListener("change", handleChange)
    
    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  })

  // Load theme on mount
  loadTheme()

  return {
    theme,
    setTheme,
    isLoading,
    loadTheme,
  }
}
