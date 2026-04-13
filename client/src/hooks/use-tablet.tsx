import * as React from "react"

const TABLET_MIN_BREAKPOINT = 768
const TABLET_MAX_BREAKPOINT = 1024

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkIsTablet = () => {
      const width = window.innerWidth
      setIsTablet(width >= TABLET_MIN_BREAKPOINT && width < TABLET_MAX_BREAKPOINT)
    }
    
    const mqlMin = window.matchMedia(`(min-width: ${TABLET_MIN_BREAKPOINT}px)`)
    const mqlMax = window.matchMedia(`(max-width: ${TABLET_MAX_BREAKPOINT - 1}px)`)
    
    const onChange = () => checkIsTablet()
    
    mqlMin.addEventListener("change", onChange)
    mqlMax.addEventListener("change", onChange)
    checkIsTablet()
    
    return () => {
      mqlMin.removeEventListener("change", onChange)
      mqlMax.removeEventListener("change", onChange)
    }
  }, [])

  return !!isTablet
}
