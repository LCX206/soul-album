# 删除「阿禾的两天」与「节奏」演示页 · 任务书

> 状态：待执行。目标是把两个遗留合成演示页彻底移除，产品只剩默认的 FreeTrial（对话 / 画册 / 生活数据）三页。
>
> **执行顺序建议**：先做本任务（删演示页），再做配色替换（`color-scheme.md`）——先删后配色，配色时少处理几个文件，也更干净。

---

## 一、要删除的页面

| 路由 | 页面 | 标题 | 组件 |
|---|---|---|---|
| `?demo=story` | 阿禾的两天（合成引导剧情） | 「阿禾的两天」 | `GuidedStory.tsx` |
| `?demo=rhythm` | 独立节奏场景 | 「节奏如何变化」 | `RhythmDemo.tsx` |

---

## 二、整文件删除（8 个）

```
src/features/story/GuidedStory.tsx        # 阿禾的两天
src/features/rhythm/RhythmDemo.tsx        # 节奏演示
src/data/ahe.ts                           # 阿禾合成数据（只被 GuidedStory 用）
src/features/sources/SourcePicker.tsx     # 只被 GuidedStory 用
src/pages/LandingPage.tsx                 # 死代码（未被任何地方 import，且依赖 Entrance 类型）
tests/demo.spec.ts                        # 整个是 demo=story/demo=rhythm 的 e2e 测试
public/synthetic-street-2026-09-29.png    # 阿禾剧情的合成街景图
docs/contracts/ai-experiment.md           # 阿禾合成 AI 实验契约（设计文档，未实现）
```

> `src/pages/` 目录删空后可直接移除该目录。

---

## 三、修改的文件

### 1. `src/App.tsx` —— 删路由，改为只渲染 FreeTrial

删除 `GuidedStory`、`RhythmDemo` 的 import、`Entrance` 类型、`demo` 参数判断，最终整个文件收敛为：

```tsx
import FreeTrial from './features/free/FreeTrial'

function App() {
  return <FreeTrial />
}

export default App
```

### 2. `src/features/album/AlbumPage.tsx` —— 简化 `synthetic` 模式

当前组件有两个模式：`mode: 'synthetic' | 'private'`。删除 GuidedStory 后，`synthetic` 只剩死代码，按以下收敛：

- **删 `mode` prop**，组件内固定为 private 行为：
  - `overline` / 详情面板里的「合成演示日页」「合成资料」等三元 → 只留 private 文案（「私人日页 · 规则模式」「只保留在本次页面」）。
  - `阿禾原话修正` → 统一为 `你的原话修正`。
  - 详情面板里「均为阿禾自述」的 basis 文案 → 只留「依据：本页原话与 N 条此前回答。」。
- **删 `entryLabels` prop**（synthetic 专属）：`story-entry-kind` 固定渲染 `记录片段`。
- **删 `derivedObservation` prop**（synthetic 专属）：连同「Agent 新的暂定观察」区块一起删。
- **保留 `onCorrect` prop**：「不是这样」纠正按钮是产品核心能力，保留为可选 prop，供 FreeTrial 后续接入。

收敛后的 props 形如：

```tsx
type AlbumPageProps = {
  album: AlbumView
  journal: JournalState
  dateForDay: (day: number) => string
  displayDateForDay?: (day: number) => string
  weather?: { icon: string; summary: string; temperature: string; location: string }
  onCorrect?: () => void
}
```

### 3. `src/features/free/FreeTrial.tsx` —— 去掉 `mode="private"`

`FreeTrial.tsx` 里有 4 处 `<AlbumPage mode="private" ... />`（书册右页 + 翻页动画的两处 front/back），删掉 `mode="private"` 参数即可，其余 props 不变。

### 4. `src/features/album/AlbumPage.test.tsx` —— 去掉 synthetic 用例

- 测试 1、2 用了 `mode="synthetic"`：删掉 `mode` 参数，改用 private 语义（照片 fallback、`记录片段` 标签的断言不变）。
- 测试 3 里的 `not.toHaveTextContent('阿禾')`：删掉 `'阿禾'` 与 `'合成'` 断言（删完合成模式后这些词不再出现，断言无意义）；保留 `你的原话修正` 断言。
- 测试 4（天气）不变。

### 5. `tests/privacy.spec.ts` —— 删 demo 相关段落

删掉 `page.goto('/?demo=story')` 与 `page.goto('/?demo=rhythm')` 的用例块（约 255–258 行），保留 FreeTrial 主路径的隐私断言。

### 6. 文档引用清理

以下文档里的「阿禾」「`?demo=story`」「`?demo=rhythm`」表述需删除或改写：

```
README.md                              # 第 26、28 行的演示入口说明
docs/handoff/frontend.md               # 第 15 行表格中的旧演示行
docs/handoff/assets.md                 # 合成街景图的说明（图已删，整段删）
docs/architecture/README.md            # 阿禾合成 AI 实验契约的引用段落
docs/handoff/evidence/README.md        # 若含 demo 截图引用，一并删
```

---

## 四、不要删（被 FreeTrial 共享）

```
src/domain/selectors.ts      # selectAlbum / selectComparison 等，FreeTrial 在用
src/domain/invitations.ts    # 邀请节奏逻辑，FreeTrial 在用
src/domain/journal.ts        # 唯一记录状态，核心
src/data/behaviorSamples.ts  # DataInsights「生活数据」页在用
src/features/data/DataInsights.tsx   # 「生活数据」页
src/features/free/FreeTrial.tsx      # 产品主页面
```

---

## 五、验证

```bash
npm test          # 全绿（删除后用例数会减少，确保无残留 import 报错）
npx tsc -b        # 零错误（删除后不应有找不到模块的报错）
npm run build     # 构建通过
```

> 额外自查：`grep -rn "阿禾\|demo=story\|demo=rhythm\|GuidedStory\|RhythmDemo\|ahe" src tests` 应无结果（`AlbumPage` 内的 `阿禾` 文案已按第三节清理）。
