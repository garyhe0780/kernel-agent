import { Activity, Building2, CircleDot, ClipboardCheck, ContactRound, Files, Flag, FolderKanban, Handshake, ListTodo, Newspaper, Package, ReceiptText, ShoppingCart, Ticket, Users, Wallet, type LucideIcon } from 'lucide-react'
import { inferNavigationIcon, type NavigationIcon } from '@/kernel/navigation-icons'
import type { Definition } from '@/kernel/definition'
import type { NavigationItem } from '@/kernel/application-views'

/** Static imports keep the shipped icon set bounded and tree-shakeable. */
const icons: Record<NavigationIcon, LucideIcon> = {
  purchase: ShoppingCart, organization: Building2, contact: ContactRound, people: Users,
  deal: Handshake, project: FolderKanban, task: ListTodo, issue: CircleDot,
  payment: Wallet, ticket: Ticket, activity: Activity, milestone: Flag,
  asset: Package, order: ReceiptText, document: Newspaper, audit: ClipboardCheck, records: Files,
}

export function entityNavigationIcon(item: Pick<NavigationItem, 'icon'>, definition?: Definition): LucideIcon {
  const key = item.icon ?? inferNavigationIcon(definition)
  return Object.hasOwn(icons, key) ? icons[key] : Files
}
