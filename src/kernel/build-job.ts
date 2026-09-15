export type BuildJobEvent = { id: number; task: string; message: string; at: string; details?: unknown }
export type BuildJobSnapshot = {
  id: string; planId: string; planVersion: number
  status: 'queued' | 'running' | 'failed' | 'completed' | 'superseded'
  task: string; revision: number; completedTasks: string[]; events: BuildJobEvent[]
  error: { code: string; message: string; details?: unknown } | null
  draftId: string | null
}
export const buildIsActive = (job?: BuildJobSnapshot | null) => job?.status === 'queued' || job?.status === 'running'
