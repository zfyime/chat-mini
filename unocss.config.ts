import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetUno,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.1,
      cdn: 'https://esm.sh/',
    }),
    presetTypography({
      cssExtend: {
        'ul,ol': {
          'padding-left': '1.8em',
          'position': 'relative',
        },
      },
    }),
  ],
  transformers: [transformerVariantGroup(), transformerDirectives()],
  shortcuts: [{
    'fc': 'flex justify-center',
    'fi': 'flex items-center',
    'fb': 'flex justify-between',
    'fcc': 'fc items-center',
    'fie': 'fi justify-end',
    'col-fcc': 'flex-col fcc',
    'inline-fcc': 'inline-flex items-center justify-center',
    'base-focus': 'focus:(bg-op-20 ring-0 outline-none)',
    'b-slate-link': 'border-b border-(slate none) hover:border-dashed',
    'gpt-title': 'text-2xl font-extrabold mr-1',
    'gpt-subtitle': 'text-(2xl transparent) font-extrabold bg-(clip-text gradient-to-r) from-sky-400 to-emerald-600',
    'gpt-copy-btn': 'absolute top-12px right-12px z-3 fcc border b-transparent w-8 h-8 p-2 bg-light-300 dark:bg-dark-300 op-90 cursor-pointer',
    'gpt-copy-tips': 'op-0 h-7 bg-black px-2.5 py-1 box-border text-xs c-white fcc rounded absolute z-1 transition duration-600 whitespace-nowrap -top-8',
    'gpt-retry-btn': 'fi gap-1 px-2 py-0.5 op-70 border border-slate rounded-md text-sm cursor-pointer hover:bg-slate/10',
    'gpt-back-top-btn': 'fcc p-2.5 text-base rounded-md hover:bg-slate/10 fixed bottom-60px right-20px z-10 cursor-pointer transition-colors',
    'gpt-back-bottom-btn': 'gpt-back-top-btn bottom-20px transform-rotate-180deg',
    'gpt-password-input': 'px-4 py-3 h-12 rounded-sm bg-(slate op-15) base-focus',
    'gpt-password-submit': 'fcc h-12 w-12 bg-slate cursor-pointer bg-op-20 hover:bg-op-50',
    'gen-slate-btn': 'h-12 px-4 py-2 bg-(slate op-15) hover:bg-op-20 rounded-sm',
    'gen-text-wrapper': 'my-4 fc gap-2 transition-opacity',
    // 统一输入容器：textarea 与底栏按钮包在一个大圆角框内，聚焦时整体加深
    'gen-input-box': 'flex flex-col gap-1 p-2 rounded-2xl bg-(slate op-15) transition-colors focus-within:bg-op-20',
    'gen-textarea': 'w-full px-2 py-1.5 min-h-11 max-h-52 bg-transparent resize-none outline-none ring-0 placeholder:op-50 dark:(placeholder:op-30) scroll-pa-8px',
    // 底栏幽灵工具按钮（附件 / 联网 / 清空）
    'gen-bar-btn': 'fi gap-1 h-9 px-2.5 rounded-lg text-sm transition-colors cursor-pointer hover:bg-slate/10 disabled:(op-40 cursor-not-allowed)',
    // 圆角方形主发送按钮
    'gen-send-btn': 'fcc w-9 h-9 rounded-xl bg-$c-fg text-$c-bg transition-all cursor-pointer hover:op-80 active:scale-95 disabled:(op-30 cursor-not-allowed)',
    'sys-edit-btn': 'inline-fcc gap-1 text-sm bg-slate/20 px-2 py-1 rounded-md transition-colors cursor-pointer hover:bg-slate/50',
    'stick-btn-on': '!bg-$c-fg text-$c-bg hover:op-80',
  }],
})
