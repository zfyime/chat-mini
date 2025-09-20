import { For, Show, createEffect, createSignal } from 'solid-js'
import { useStorage } from 'solidjs-use'
import { AVAILABLE_MODELS, CONFIG } from '@/config/constants'
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
            <span>聊天设置</span>
          </span>
        </Show>
      </Show>
      <Show when={props.systemRoleEditing() && props.canEdit()}>
        <div class="space-y-4">
          {/* Prompt section */}
          <div>
            <div class="fi gap-1 op-50 dark:op-60">
              <IconEnv />
              <span>角色预设:</span>
            </div>
            <textarea
              ref={systemInputRef!}
              placeholder="在这里为 AI 设定行为和角色。"
              autocomplete="off"
              autofocus
              rows="3"
              value={props.currentSystemRoleSettings()}
              class="mt-2 w-full rounded-lg"
              gen-textarea
            />
          </div>

          {/* Parameters section */}
          <div class="grid grid-cols-2 gap-x-4 items-center">
            <div class="space-y-2">
              <label for="select-setting" class="fi gap-1 op-50 dark:op-60 text-sm">模型:</label>
              <select
                id="select-setting"
                value={chatModel()}
                class="w-full rounded-lg p-2 appearance-none"
                gen-textarea
                onChange={e => setChatModel(e.currentTarget.value)}
              >
                <For each={AVAILABLE_MODELS}>
                  {model => <option value={model.id}>{model.name}</option>}
                </For>
              </select>
            </div>
            <div class="space-y-2 pt-6">
              <SettingsSlider
                settings={{
                  name: '温度',
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

          {/* Buttons section */}
          <div class="fi justify-start gap-2">
            <button onClick={handleButtonClick} class="rounded-lg" gen-slate-btn>
              保存
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
