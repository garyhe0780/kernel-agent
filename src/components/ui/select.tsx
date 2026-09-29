import { Button, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue, Text } from 'react-aria-components'

export function Select({
  label,
  value,
  onChange,
  options,
  description,
  invalid = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  description?: string
  invalid?: boolean
}) {
  return (
    <AriaSelect
      className="field"
      selectedKey={value}
      isInvalid={invalid}
      disabledKeys={options.filter(option => option.disabled).map(option => option.value)}
      onSelectionChange={key => {
        if (key != null) onChange(String(key))
      }}
    >
      <Label className="field-label">{label}</Label>
      <Button className="select-trigger input">
        <SelectValue />
      </Button>
      {description ? <Text slot="description" className={invalid ? 'field-error' : 'field-description'}>{description}</Text> : null}
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
