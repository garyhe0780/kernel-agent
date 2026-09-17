import handler from '@tanstack/react-start/server-entry'
import { ApplicationBuildWorkflow } from './kernel/build-workflow.server'

export { ApplicationBuildWorkflow }

export default {
  fetch: handler.fetch,
}
