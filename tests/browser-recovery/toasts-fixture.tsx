import React from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { Toaster } from '../../src/components/ui/sonner'
import { Button } from '../../src/components/ui/button'
import '../../src/styles.css'

// Exercises the production host without authentication, requests, or real writes.
function Fixture() {
  return <><main className="app-desk" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Notification verification</h1>
    <p>Synthetic feedback · No live data is changed.</p>
    <div className="actions">
      <Button onPress={() => toast.success('Group created.', { description: 'Add members and permission policies.' })}>Show success</Button>
      <Button onPress={() => toast.error('Changes could not be saved.', { description: 'Your entries are retained. Try again.', duration: 8000 })}>Show error</Button>
      <Button onPress={() => toast.info('Preview refreshed.')}>Show information</Button>
      <Button onPress={() => toast.warning('Application definition changed.', { description: 'Refresh before making another change.' })}>Show warning</Button>
      <Button onPress={() => toast.success('Permissions updated.', { description: `Engineering and operations across all regional workspaces. ${'A'.repeat(160)}` })}>Show long message</Button>
      <Button onPress={() => toast.dismiss()}>Dismiss all</Button>
    </div>
  </main><Toaster /></>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
