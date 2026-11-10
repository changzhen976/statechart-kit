/**
 * CDATA 中和（XML 文本 → 等价转义文本）。
 *
 * 部分 Node XML 解析器（含 happy-dom）对 `<script><![CDATA[...]]></script>` 兼容性差，
 * 会把 CDATA 内容当成非法标记。把 CDATA 段替换为等价的 XML 转义文本后，DOM 的
 * `textContent` 与原内容完全一致；浏览器原生解析器同样适用。
 *
 * 用于 SCXML 导入与引擎层校验（compile 只读文本、不执行脚本），不改变文件内容。
 */
export function neutralizeCdata(xml: string): string {
  const merged = xml.replace(/\]\]\]>\s*<!\[CDATA\[/g, '')
  return merged.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, code: string) =>
    code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  )
}
