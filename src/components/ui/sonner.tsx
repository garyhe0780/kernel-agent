import { useEffect, useState, type CSSProperties } from 'react'
import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

/** One notification host for every route, including feedback after navigation. */
export function Toaster() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(viewport.matches)
    update()
    viewport.addEventListener('change', update)
    return () => viewport.removeEventListener('change', update)
  }, [])
  return <Sonner
    className="kernel-toaster"
    position={mobile ? 'bottom-right' : 'top-right'}
    theme="light"
    closeButton
    duration={5000}
    visibleToasts={3}
    gap={12}
    offset={{ top: 'max(68px, env(safe-area-inset-top))', right: 24 }}
    mobileOffset={{ top: 'calc(112px + env(safe-area-inset-top))', bottom: 'max(16px, env(safe-area-inset-bottom))', left: 16, right: 16 }}
    style={{ '--width': '380px' } as CSSProperties}
    icons={{
      success: <CircleCheck aria-hidden="true" />,
      error: <CircleAlert aria-hidden="true" />,
      info: <Info aria-hidden="true" />,
      warning: <TriangleAlert aria-hidden="true" />,
      close: <X aria-hidden="true" />,
    }}
    toastOptions={{ closeButtonAriaLabel: 'Dismiss notification' }}
  />
}
