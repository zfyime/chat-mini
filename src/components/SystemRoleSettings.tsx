import { For, Show } from 'solid-js'
import { AVAILABLE_MODELS } from '@/config/constants'
import { useAtom } from '@/hooks/useAtom'
import {
  currentModel as currentModelAtom,
  setModel,
  setTemperature,
  temperature as temperatureAtom,
} from '@/store/uiStore'
import IconEnv from './icons/Env'
import { Slider } from './Slider'
import type { Accessor, Setter } from 'solid-js'

interface Props {
  canEdit: Accessor<boolean>
  systemRoleEditing: Accessor<boolean>
  setSystemRoleEditing: Setter<boolean>
  currentSystemRoleSettings: Accessor<string>
  setCurrentSystemRoleSettings: Setter<string>
}

export default (props: Props) => {
  let systemInputRef: HTMLTextAreaElement
  // 模型与温度直接读写 uiStore，与 Header 的模型下拉共享同一份状态
  const currentModel = useAtom(currentModelAtom)
  const temperature = useAtom(temperatureAtom)

  const handleButtonClick = () => {
    props.setCurrentSystemRoleSettings(systemInputRef.value)
    props.setSystemRoleEditing(false)
  }

  return (
    <div class="my-4 mb-8">
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
              class="mt-2 settings-field"
            />
          </div>

          {/* Parameters section */}
          <div class="grid grid-cols-2 gap-x-4 items-center">
            <div class="space-y-2">
              <label for="select-setting" class="fi gap-1 op-50 dark:op-60 text-sm">模型:</label>
              <select
                id="select-setting"
                value={currentModel()}
                class="settings-field appearance-none"
                onChange={e => setModel(e.currentTarget.value)}
              >
                <For each={AVAILABLE_MODELS}>
                  {model => <option value={model.id}>{model.name}</option>}
                </For>
              </select>
            </div>
            <div class="space-y-2 pt-6">
              <Slider
                name="温度"
                min={0}
                max={2}
                step={0.01}
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
