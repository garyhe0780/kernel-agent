import type { ReactNode } from 'react'
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from 'react-aria-components'

export function Tabs({
  label,
  value,
  onChange,
  tabs,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  tabs: { id: string; label: string; panel: ReactNode }[]
}) {
  return (
    <AriaTabs className="tabs" selectedKey={value} onSelectionChange={key => onChange(String(key))}>
      <TabList className="tabs-list" aria-label={label}>
        {tabs.map(tab => (
          <Tab id={tab.id} key={tab.id} className="tabs-trigger">{tab.label}</Tab>
        ))}
      </TabList>
      {tabs.map(tab => (
        <TabPanel id={tab.id} key={tab.id} className="tabs-panel">{tab.panel}</TabPanel>
      ))}
    </AriaTabs>
  )
}
