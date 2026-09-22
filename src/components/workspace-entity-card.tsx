import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/surfaces'

const actionVariants = {
  primary: 'button-primary',
  outline: 'button-outline',
  ghost: 'button-ghost',
} as const

export function WorkspaceActionLink({
  children,
  variant = 'outline',
  className,
  to,
  params,
}: {
  children: ReactNode
  variant?: keyof typeof actionVariants
  className?: string
  to: string
  params?: Record<string, string>
}) {
  return (
    <Link className={cn('button', actionVariants[variant], className)} to={to} params={params}>
      {children}
      <ArrowRight data-icon="inline-end" />
    </Link>
  )
}

export function WorkspaceEntityCard({
  title,
  description,
  badge,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('entity-card', className)}>
      <div className="entity-card-copy">
        <CardHeader>
          <div className="entity-card-title-row">
            <h3 className="card-title">{title}</h3>
            {badge}
          </div>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </div>
      {actions ? <div className="entity-card-actions">{actions}</div> : null}
    </Card>
  )
}
