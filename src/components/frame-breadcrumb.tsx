import { createContext, type Dispatch, type SetStateAction } from 'react'

export type FrameBreadcrumbItem = {
  label: string
  onPress?: () => void
}

// Nested screens can replace the frame trail without adding a second nav row.
export const FrameBreadcrumbContext = createContext<
  Dispatch<SetStateAction<FrameBreadcrumbItem[] | null>> | null
>(null)
