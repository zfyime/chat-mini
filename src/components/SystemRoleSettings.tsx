import { Show, createEffect, createSignal, For } from 'solid-js'
import { useStorage } from 'solidjs-use'
import IconEnv from './icons/Env'
import SettingsSlider from './SettingsSlider'
import { AVAILABLE_MODELS, CONFIG } from '@/config/constants'
import type { Accessor, Setter } from 'solid-js'

interface Props {
  canEdit: Accessor<boolean>
  systemRoleEditing: Accessor<boolean>
  setSystemRoleEditing: Setter<boolean>
  currentSystemRoleSettings: Accessor<string>
  setCurrentSystemRoleSettings: Setter<string>
  temperatureSetting: (value: number) => void
  chatModelSetting: (value: string) => void
}

export default (props: Props) => {
  let systemInputRef: HTMLTextAreaElement
  const [temperature, setTemperature] = createSignal(CONFIG.DEFAULT_TEMPERATURE)
  const [chatModel, setChatModel] = useStorage('selected_model', AVAILABLE_MODELS[0].id)

  const handleButtonClick = () => {
    props.setCurrentSystemRoleSettings(systemInputRef.value)
    props.setSystemRoleEditing(false)
  }

  createEffect(() => {
    props.temperatureSetting(temperature())
    props.chatModelSetting(chatModel())
  })

  return (
    <div class="my-4">
      <Show when={!props.systemRoleEditing()}>
        <Show when={props.canEdit()}>
          <span onClick={() => props.setSystemRoleEditing(!props.systemRoleEditing())} class="sys-edit-btn">
            <IconEnv />
            <span>Chat Setting</span>
          </span>
        </Show>
      </Show>
      <Show when={props.systemRoleEditing() && props.canEdit()}>
        <div>
          <div class="fi gap-1 op-50 dark:op-60">
            <IconEnv />
            <span>Role:</span>
          </div>
          <div class="mt-2">
            <textarea
              ref={systemInputRef!}
              placeholder="Gently instruct the assistant and set the behavior of the assistant."
              autocomplete="off"
              autofocus
              rows="3"
              value={props.currentSystemRoleSettings()}
              gen-textarea
            />
          </div>
          <div class="w-full fi fb op-50 mt-2 mb-2">
            <label for="select-setting">Model:</label>
            <select
              id="select-setting"
              value={chatModel()}
              class="px-3 w-full ml-2 py-3 bg-(slate op-15)"
              onChange={e => setChatModel(e.currentTarget.value)}
            >
              <For each={AVAILABLE_MODELS}>
                {model => <option value={model.id}>{model.name}</option>}
              </For>
            </select>
          </div>
          <div class="w-full fi fb">
            <button onClick={handleButtonClick} gen-slate-btn>
              Set
            </button>
            <div class="w-full ml-2">
              <SettingsSlider
                settings={{
                  name: 'Temperature',
                  type: 'slider',
                  min: 0,
                  max: 2,
                  step: 0.01,
                }}
                editing={() => true}
                value={temperature}
                setValue={setTemperature}
              />
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}