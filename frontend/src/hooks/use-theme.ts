import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const detect = () => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    }
    detect()
    const observer = new MutationObserver(detect)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
