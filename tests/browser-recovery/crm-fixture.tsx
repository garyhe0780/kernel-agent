import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { compileAssembly, assemblePattern } from '../../src/kernel/application'
import { validateFields, evaluate, type RecordData } from '../../src/kernel/definition'
import { AssignmentMembers } from '../../src/components/record-context'
import { matchesView } from '../../src/kernel/application-views'
import { ExportRecords } from '../../src/components/export-records'
import { RecordBoard } from '../../src/components/record-board'
import { RecordDetail } from '../../src/components/record-detail'
import { ActionDialog, CreateEntityDialog } from '../../src/components/kernel-dialogs'
import { RelatedRecords } from '../../src/components/related-records'
import { Button } from '../../src/components/ui/button'
import type { BusinessRecord, CapabilitySnapshot } from '../../src/lib/client'
import '../../src/styles.css'
const app = compileAssembly(assemblePattern('crm_sales'))
const definition = app.entities[0]
delete definition.actions.find(action=>action.name==='edit')!.input.contactPerson.referenceMatch
const record = (id: string, capability: string, data: RecordData): BusinessRecord => ({ id, capability, entity: 'example', version: 1, createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z', data })
const account = record('account', 'customers', { title: 'Example account', status: 'active' })
const otherAccount = record('other-account', 'customers', { title: 'Second account', status: 'active' })
const contact = record('contact-one', 'contacts', { title: 'Jordan at Example', account: 'account', status: 'active' })
const otherContact = record('contact-two', 'contacts', { title: 'Taylor at Second', account: 'other-account', status: 'active' })
const team = record('rep', 'people', { title: 'Alex Chen', status: 'active' })
const task = record('task', 'tasks', { title: 'Send proposal', status: 'open', deal: 'deal', dueDate: '2026-09-30' })
function Fixture() {
 const [data,setData] = useState(validateFields(definition.entity.fields,{title:'Annual subscription', customer:'account',contactPerson:'contact-one',owner:'rep',amountCents:250000,nextStep:'Send proposal',followUpDate:'2026-09-28',assignee:'user-alex'},true))
 const [action,setAction] = useState<string>()
 const [creation,setCreation] = useState<{capability:CapabilitySnapshot;references:Record<string,string>}>()
 const [created,setCreated] = useState<BusinessRecord[]>([])
 const [createError,setCreateError] = useState('')
 const [failOnce,setFailOnce] = useState(true)
 const [narrow,setNarrow] = useState(false)
 const [message,setMessage] = useState('Synthetic records; no live data is changed.')
 const deal = record('deal','opportunities',data)
 const records = [account,otherAccount,contact,otherContact,team,task,deal,...created]
 return <AssignmentMembers.Provider value={[{id:'user-alex',name:'Alex Chen'},{id:'user-sam',name:'Sam Rivera'}]}><main className="main-body" style={{maxWidth:narrow?390:1200,margin:'0 auto'}}>
  <h1>Sales CRM workflow verification</h1><p role="status">{message}</p>
  <p>My deals: {Number(matchesView(data,app.views.find(view=>view.id==='my_deals'),{userId:'user-alex'}))}</p>
  <Button onPress={()=>setNarrow(!narrow)}>{narrow?'Desktop layout':'Narrow layout'}</Button>
  <ExportRecords definition={definition} records={[deal]} related={records} name="Synthetic CRM export" />
  <RecordBoard definition={definition} columns={app.views[0].columns} records={[deal]} related={records} selectedId="deal" onSelect={()=>setMessage('Selected annual subscription')} />
  <RecordDetail definition={definition} data={data} records={records} layout={app.layouts[0]} />
  <RelatedRecords onCreate={(capability,field)=>{setCreateError('');setCreation({capability,references:{[field]:deal.id}})}} record={deal} records={records} capabilities={app.entities.map(definition=>({slug:definition.slug,version:1,definition}))} onSelect={r=>setMessage(`Opened ${r.data.title}`)} />
  {creation ? <CreateEntityDialog open definition={creation.capability.definition} records={records} initialReferences={creation.references} error={createError} busy={false} onOpenChange={open=>{if(!open)setCreation(undefined)}} onCreate={input=>{if(failOnce){setFailOnce(false);setCreateError('Synthetic save failure. Your entries are retained; try again.');return} const data=validateFields(creation.capability.definition.entity.fields,input,true);setCreated(current=>[...current,record(`created-${current.length}`,creation.capability.slug,data)]);setCreation(undefined);setMessage('Linked record created in this fixture')}} /> : null}
  <Button onPress={()=>{setCreateError('');setCreation({capability:{slug:definition.slug,version:1,definition},references:{customer:account.id}})}}>New deal for account</Button>
  <Button onPress={()=>setAction('edit')}>Edit deal</Button>
  <ActionDialog open={Boolean(action)} actionName={action} record={deal} definition={definition} records={records} busy={false} role="owner" onOpenChange={open=>{if(!open)setAction(undefined)}} onSubmit={(name,input)=>{setData(evaluate(definition,name,data,input,'owner').after);setAction(undefined);setMessage('Changes saved in this fixture')}} />
 </main></AssignmentMembers.Provider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
