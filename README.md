# userscripts

个人油猴脚本集。

## 脚本清单

| 脚本 | 平台 | 用途 |
|---|---|---|
| `clipper-mobile.user.js` | iOS Safari + Userscripts App | 提取网页正文为纯文字，预览后一键发送到快捷指令「剪藏-记」 |
| `adguarder-mobile.user.js` | 移动端浏览器（含 iOS Safari） | 全站屏蔽谷歌广告；小红书额外拦截登录遮罩与 App 唤起 |

## 安装

点击对应脚本的 raw 链接，油猴扩展会自动识别并弹出安装提示。

- iOS Safari：安装 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) App
- 桌面端：安装 [Tampermonkey](https://www.tampermonkey.net/)

## 使用说明

### 剪藏-记

页面右下角出现「剪藏」浮球，点击后弹出预览面板：

- 正文可直接编辑，残留噪音手动删除后再提交
- 点「发送到快捷指令」递交给 iOS 快捷指令「剪藏-记」完成记录
- 正文超过 6000 字时受 URL 长度限制，改为复制到剪贴板，需手动运行快捷指令
- 另有「重新提取」「复制正文」按钮

脚本不保存任何凭证，也不直接读写表格。

### 去广告

全站屏蔽谷歌广告，覆盖 `ins.adsbygoogle`、`div-gpt-ad-*`、`google_ads_*`、`aswift_*`，以及 googlesyndication、doubleclick 的 iframe。

小红书站点额外处理：移除登录遮罩与各类弹窗、解锁页面滚动、拦截唤起 App 的 URL scheme（`xhsdiscover`、`snssdk`、`weixin`、`openapp`）。

新增站点规则时，在 `SITE_RULES` 数组中追加一条即可，字段包括选择器列表、是否解锁滚动、需拦截的 scheme。

## 设计说明

### 正文提取

两个环节复用同一套策略：

1. 先在 DOM 副本上移除页头、页尾、导航、侧栏、评论、推荐、广告等干扰节点
2. 交由 Readability 抽取文章主体
3. 按块级元素切分段落，段间以空行分隔
4. 行内空白归一、压缩多余空行

Readability 未命中时回退为整页文本。

### 记录格式

记录由 iOS 快捷指令写入表格，列为：时间戳 / 标题 / 正文。

### 去广告的实现

在 `document-start` 阶段注入样式表隐藏广告位，并以 MutationObserver 持续清理动态插入的节点。小红书还需解除遮罩带来的滚动锁，脚本会重置 `html` 与 `body` 的 `overflow`、`position`、`height`。

## 许可

MIT
