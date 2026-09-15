import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Spinner } from './ui/surfaces'
import type { BuildProgress as Progress } from '@/lib/progress-stream'

export function BuildProgress({ events }: { events: Progress[] }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => { const started = Date.now(); const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(timer) }, [])
  const current = events.at(-1)
  return <section className="build-progress" aria-label="Build activity">
    <div className="build-progress-heading"><h2>{current?.stage === 'planning' ? 'Shaping your application' : 'Your application is taking shape'}</h2><span className="muted" aria-label="Elapsed time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></div>
    <p role="status" aria-live="polite">{current?.message ?? 'Connecting to your saved plan…'}</p>
    <ol aria-label="Completed and current activity">{events.map((event, index) => <li key={`${event.stage}-${index}`} data-current={index === events.length - 1}>{index === events.length - 1 ? <Spinner /> : <Check aria-hidden="true" />}<span>{event.message}</span>{index < events.length - 1 ? <span className="sr-only"> Completed</span> : null}</li>)}</ol>
    <p className="muted">{seconds >= 30 ? 'Still working. Some model requests take a few minutes. Your planning work is saved; publishing remains your choice.' : 'Your planning work is saved. Nothing is published while Kernel builds.'}</p>
  </section>
}
