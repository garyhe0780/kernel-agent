import type { ReactNode } from 'react'
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <ModalOverlay className="dialog-overlay" isOpen={open} onOpenChange={onOpenChange} isDismissable>
      <Modal className="dialog-modal">
        <AriaDialog className="dialog-content">
          <header className="dialog-header">
            <Heading slot="title" className="dialog-title">{title}</Heading>
            {description ? <p className="dialog-description">{description}</p> : null}
          </header>
          <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onPress={() => onOpenChange(false)}>
            <X data-icon="inline-start" />
          </Button>
          {children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  )
}
