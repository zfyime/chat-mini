// 等待 AI 首字时显示的"正在输入"占位气泡：三个跳动的小圆点
// 复用 MessageItem 中 AI 气泡的外层排版，保证与真实消息位置对齐
export default () => {
  return (
    <div class="md:py-2 md:px-4">
      <div class="flex rounded-lg">
        <div class="flex-1 text-slate/60" role="status" aria-label="AI 正在输入">
          <span class="typing-dots">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  )
}
