import type { ComponentProps, ReactNode } from 'react'
import { Separator as AriaSeparator, Switch as AriaSwitch, ToggleButtonGroup, ToggleButton, type Key } from 'react-aria-components'
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
export function Card({ className, ...props }: ComponentProps<'section'>) { return <section className={cn('card', className)} {...props} /> }
export function CardHeader(props: ComponentProps<'header'>) { return <header className="card-header" {...props} /> }
export function CardTitle(props: ComponentProps<'h2'>) { return <h2 className="card-title" {...props} /> }
export function CardDescription(props: ComponentProps<'p'>) { return <p className="card-description" {...props} /> }
export function CardContent({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('card-content', className)} {...props} /> }
export function CardFooter(props: ComponentProps<'footer'>) { return <footer className="card-footer" {...props} /> }
export function Badge({ children, variant = 'neutral' }: { children: ReactNode; variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }) { return <span className={cn('badge', `badge-${variant}`)}>{children}</span> }
export function Alert({ children, variant = 'info' }: { children: ReactNode; variant?: 'info' | 'danger' | 'warning' }) { return <div role={variant === 'danger' ? 'alert' : 'status'} className={cn('alert', `alert-${variant}`)}><AlertCircle size={18} aria-hidden="true" /><div>{children}</div></div> }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><Inbox size={30} aria-hidden="true" /><h3>{title}</h3><div>{children}</div></div> }
export function Separator() { return <AriaSeparator className="separator" /> }
export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cn('skeleton', className)} /> }
export function Spinner(props: ComponentProps<typeof LoaderCircle>) { return <LoaderCircle className="spinner" aria-hidden="true" {...props} /> }
export function Switch({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) { return <AriaSwitch className="switch" isSelected={checked} onChange={onChange}><span className="switch-track"><span /></span><span className="switch-copy"><strong>{label}</strong>{description && <span>{description}</span>}</span></AriaSwitch> }
export function ToggleGroup({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <ToggleButtonGroup aria-label={label} className="toggle-group" selectionMode="single" disallowEmptySelection selectedKeys={new Set<Key>([value])} onSelectionChange={keys => { const key = [...keys][0]; if (key !== undefined) onChange(String(key)) }}>{options.map(option => <ToggleButton id={option.value} key={option.value} className="toggle-item">{option.label}</ToggleButton>)}</ToggleButtonGroup> }
