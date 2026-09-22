import type { ComponentProps, ReactNode } from 'react'
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('dialog-header', className)} {...props} />
}

export function DialogTitle({ className, ...props }: Omit<ComponentProps<typeof Heading>, 'slot'>) {
  return <Heading slot="title" data-slot="dialog-title" className={cn('dialog-title', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-description" className={cn('dialog-description', className)} {...props} />
}

export function Dialog({
  open,
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  className,
  showCloseButton = true,
  isDismissable = true,
}: {
  open?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  className?: string
  showCloseButton?: boolean
  isDismissable?: boolean
}) {
  return (
    <ModalOverlay className="dialog-overlay" isOpen={open ?? isOpen} onOpenChange={onOpenChange} isDismissable={isDismissable}>
      <Modal className={cn('dialog-modal', className)}>
        <AriaDialog className="dialog-content">
          {title ? (
            <header className="dialog-header">
              <Heading slot="title" className="dialog-title">{title}</Heading>
              {description ? <p className="dialog-description">{description}</p> : null}
            </header>
          ) : null}
          {showCloseButton ? (
            <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onPress={() => onOpenChange?.(false)}>
              <X data-icon="inline-start" />
            </Button>
          ) : null}
          {children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}
