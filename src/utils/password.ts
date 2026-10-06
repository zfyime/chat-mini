// 站点访问密码校验（仅服务端使用）。
// SITE_PASSWORD 支持用英文逗号分隔配置多个密码；留空表示公开访问。

const sitePassword = import.meta.env.SITE_PASSWORD || ''
const passList = sitePassword.split(',')

export const isValidPassword = (pass?: string) => {
  if (!sitePassword) return true
  // 未传密码不能匹配任何配置段（包括空段），否则尾逗号配置会放行空请求
  return pass !== undefined && (pass === sitePassword || passList.includes(pass))
}
