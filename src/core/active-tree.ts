/**
 * 激活状态层级树（core）。
 *
 * 原位于 `scxml-creator/src/core/events.ts` 末尾，与事件目录无耦合，P1 拆到独立模块。
 * 只返回结构化数据；「父 ▸ 子」连接符与「… 等全部 N 个」这类展示文案由宿主决定。
 */
import type { ProjectDoc } from './model'

/** 激活层级树节点（剪枝 + 单链合并后） */
export interface ActiveTreeNode {
  /** SCXML id（合并链取链尾叶子 id；完整路径见 flatten 的 path） */
  id: string
  /** 显示名（合并链为「父 ▸ 子」） */
  label: string
  kind: string
  children: ActiveTreeNode[]
}

/** 展平后的展示行 */
export interface ActiveRow {
  depth: number
  label: string
  /** 叶子（原子激活态）= true；区域/复合头部 = false */
  leaf: boolean
  /** 完整 id 路径（悬浮提示） */
  path: string
}

/**
 * 激活配置 → 剪枝层级树：只保留激活分支；单链复合层合并为「父 ▸ 子」（parallel
 * 头部不参与合并，保持各区可见）。陈旧激活 id（不在文档中）自动丢弃。
 */
export function activeTree(doc: ProjectDoc, activeIds: string[]): ActiveTreeNode[] {
  interface Node extends ActiveTreeNode {
    parent: string | null
    selfActive: boolean
    children: Node[]
  }
  const act = new Set(activeIds)
  const byUid = new Map<string, Node>()
  for (const s of doc.states) {
    byUid.set(s.uid, {
      id: s.id,
      label: s.label || s.id,
      kind: s.kind,
      children: [],
      parent: s.parent,
      selfActive: act.has(s.id),
    } as Node)
  }
  const roots: Node[] = []
  for (const s of doc.states) {
    const node = byUid.get(s.uid)!
    const parent = s.parent ? byUid.get(s.parent) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  // 剪枝：自身或后代激活才保留；随后自底向上压缩单链复合层
  const prune = (node: Node): Node | null => {
    node.children = node.children
      .map((c) => prune(c))
      .filter((c): c is Node => c !== null)
      .map((c) => compress(c))
    if (!(node.selfActive || node.children.length)) return null
    return node
  }
  const compress = (node: Node): Node => {
    while (
      node.kind !== 'parallel' &&
      node.children.length === 1 &&
      node.children[0]!.kind !== 'parallel'
    ) {
      const c = node.children[0]!
      // 子标签已包含父名（如「机械臂·夹取中」）时不重复父前缀
      node.label = c.label.startsWith(node.label) ? c.label : `${node.label} ▸ ${c.label}`
      node.id = c.id
      node.children = c.children
    }
    return node
  }
  return (roots.map((r) => prune(r)).filter((r): r is Node => r !== null)).map((r) => compress(r))
}

/** 层级树 → 展平展示行（depth 用于缩进；leaf 行由宿主加标记） */
export function flattenActiveTree(
  nodes: ActiveTreeNode[],
  depth = 0,
  parentPath = '',
): ActiveRow[] {
  const rows: ActiveRow[] = []
  for (const n of nodes) {
    const path = parentPath ? `${parentPath}.${n.id}` : n.id
    rows.push({ depth, label: n.label, leaf: n.children.length === 0, path })
    rows.push(...flattenActiveTree(n.children, depth + 1, path))
  }
  return rows
}

/** 激活摘要（结构化）：叶子标签、总数、是否超过显示上限 */
export interface ActiveSummary {
  /** 全部叶子标签（按树序） */
  labels: string[]
  count: number
  /** count > max */
  truncated: boolean
}

export function activeSummary(
  doc: ProjectDoc,
  activeIds: string[],
  max = 3,
): ActiveSummary {
  const labels = flattenActiveTree(activeTree(doc, activeIds))
    .filter((r) => r.leaf)
    .map((r) => r.label)
  return { labels, count: labels.length, truncated: labels.length > max }
}
