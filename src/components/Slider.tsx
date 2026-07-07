import * as slider from '@zag-js/slider'
import { normalizeProps, useMachine } from '@zag-js/solid'
import { createMemo, createUniqueId, mergeProps } from 'solid-js'
import type { Accessor } from 'solid-js'
import '../styles/slider.css'

interface Props {
  name: string
  value: Accessor<number>
  min: number
  max: number
  step: number
  disabled?: boolean
  setValue: (v: number) => void
}

export const Slider = (selectProps: Props) => {
  const props = mergeProps({
    name: 'Temperature',
    min: 0,
    max: 2,
    step: 0.01,
    disabled: false,
  }, selectProps)

  const formatSliderValue = (value: number | undefined) => {
    if (value === undefined || value === null || Number.isNaN(value))
      return 0
    return Number.isInteger(value) ? value : parseFloat(value.toFixed(2))
  }

  // Zag 1.x: useMachine 接受两个参数，value 必须是数组
  const service = useMachine(slider.machine, {
    id: createUniqueId(),
    value: [props.value()],
    min: props.min,
    max: props.max,
    step: props.step,
    disabled: props.disabled,
    // Zag 1.x: onChange → onValueChange，details.value 是数组
    onValueChange: (details) => {
      if (details?.value?.[0] !== undefined)
        props.setValue(formatSliderValue(details.value[0]))
    },
  })
  const api = createMemo(() => slider.connect(service, normalizeProps))

  return (
    <div {...api().getRootProps()}>
      <div class="text-xs op-50 fb items-center">
        <span>{props.name}</span>
        {/* Zag 1.x: outputProps → getValueTextProps()，value 是数组 */}
        <output {...api().getValueTextProps()}>{formatSliderValue(api().value[0])}</output>
      </div>
      <div class="mt-2" {...api().getControlProps()}>
        <div {...api().getTrackProps()}>
          <div {...api().getRangeProps()} />
        </div>
        {/* Zag 1.x: thumbProps/hiddenInputProps 需要传 { index: 0 } */}
        <div {...api().getThumbProps({ index: 0 })}>
          <input {...api().getHiddenInputProps({ index: 0 })} />
        </div>
      </div>
    </div>
  )
}
