import { Show, createEffect, createSignal } from 'solid-js'
import IconEnv from './icons/Env'
import SettingsSlider from './SettingsSlider'
import type { Accessor, Setter } from 'solid-js'

interface Props {
  canEdit: Accessor<boolean>
  systemRoleEditing: Accessor<boolean>
  setSystemRoleEditing: Setter<boolean>
  currentSystemRoleSettings: Accessor<string>
  setCurrentSystemRoleSettings: Setter<string>
  temperatureSetting: (value: number) => void
  chatModelSetting: (value: string) => void // 新增的回调函数
}

export default (props: Props) => {
  let systemInputRef: HTMLTextAreaElement
  const [temperature, setTemperature] = createSignal(0.7)
  const [chatModel, setChatModel] = createSignal('deepseek-chat')

  const handleButtonClick = () => {
    props.setCurrentSystemRoleSettings(systemInputRef.value)
    props.setSystemRoleEditing(false)
  }

  createEffect(() => {
    props.temperatureSetting(temperature())
    props.chatModelSetting(chatModel()) // 调用新的回调函数
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
              onChange={(e) => setChatModel(e.currentTarget.value)}
            >
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-reasoner">deepseek-reasoner</option>
              <option value="deepseek-v3">deepseek-v3</option>
              <option value="deepseek-r1">deepseek-r1</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="o1-mini">o1-mini</option>
              <option value="o3-mini">o3-mini</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="gpt-4-search">gpt-4-search</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
              <option value="claude-3-5-haiku-latest">claude-3-5-haiku-latest</option>
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