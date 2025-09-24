export type SettingsUIType = 'slider'

interface SettingsUIBase {
  name: string
  type: SettingsUIType
}

export interface SettingsUISlider extends SettingsUIBase {
  type: 'slider'
  min: number
  max: number
  step: number
}

export type SettingsUI = SettingsUISlider
