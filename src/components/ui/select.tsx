import { Button, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue } from 'react-aria-components'

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <AriaSelect
      className="field"
      selectedKey={value}
      onSelectionChange={key => {
        if (key != null) onChange(String(key))
      }}
    >
      <Label className="field-label">{label}</Label>
      <Button className="select-trigger input">
        <SelectValue />
      </Button>
      <Popover className="select-popover">
        <ListBox className="select-list">
          {options.map(option => (
            <ListBoxItem id={option.value} key={option.value} className="select-option">
              {option.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
