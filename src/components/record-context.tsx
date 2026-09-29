import { createContext, useContext, useEffect, useState } from 'react'

export type AssignmentMember = { id: string; name: string }
export const AssignmentMembers = createContext<AssignmentMember[]>([])
export const useAssignmentMembers = () => useContext(AssignmentMembers)
export function memberLabel(members: AssignmentMember[], value: unknown) {
  return value ? members.find(member => member.id === value)?.name ?? 'Unavailable member' : 'Unassigned'
}
/** Re-evaluate calendar-relative views across midnight and when returning to a background tab. */
export function useViewClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  return now
}
