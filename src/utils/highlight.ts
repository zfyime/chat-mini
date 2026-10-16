// highlight.js 按需注册语言。
// 默认入口 `highlight.js` 会静态打包全部 384 种语言（约 2.6MB 源码），且 markdown-it-highlightjs
// 默认的 auto 模式还会在每个代码块上遍历所有已注册语言做识别，因此这里只注册聊天场景常见语言。
// 新增语言：import 语言文件后补进 registerLanguage 调用即可。
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// xml 同时覆盖 html / svg；plaintext 由 core 内置，无需注册
const languages = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
}

for (const [name, language] of Object.entries(languages))
  hljs.registerLanguage(name, language)

export default hljs
