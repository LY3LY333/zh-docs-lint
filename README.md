# zh-docs-lint

[![CI](https://github.com/LY3LY333/zh-docs-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/LY3LY333/zh-docs-lint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/zh-docs-lint.svg)](https://www.npmjs.com/package/zh-docs-lint)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518.17-brightgreen.svg)](package.json)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

中文技术文档的排版检查器：**中英文之间缺空格、中文句子用了半角标点、标点重复**，一条命令全部找出来，并且能自动修复。零依赖，附带即用的 GitHub Action。

> A zero-dependency linter for Chinese technical writing. Detects missing CJK/Latin spacing, half-width punctuation in Chinese sentences and duplicated marks — then fixes them in place.

---

## 为什么需要它

中文技术文档里最常见的三类排版问题，靠人眼几乎检查不过来：

| 类型 | 例子 |
|---|---|
| 中英文之间没有空格 | `用Node写的工具` |
| 中文句子里用了半角标点 | `支持3种模式,很好用` |
| 标点重复 | `真的吗？？` / `好。。。` |

这类问题不影响理解，但让文档看起来"没打磨过"。这个工具把它们变成**可自动修复的检查项**。

## 安装

```bash
npx zh-docs-lint .           # 直接用，不用安装

# 或者克隆下来
git clone https://github.com/LY3LY333/zh-docs-lint.git
cd zh-docs-lint
node bin/zh-docs-lint.js .
```

要求 Node.js ≥ 18.17，**没有任何第三方依赖**。已发布到 npm：<https://www.npmjs.com/package/zh-docs-lint>

> 下文命令里的 `zdl` 指 `npx zh-docs-lint`（克隆后用 `node bin/zh-docs-lint.js`；`npm link` 后可直接用 `zdl`）。

## 用法

```bash
zdl .                     # 检查当前目录
zdl docs/ README.md       # 检查指定路径
zdl --fix                 # 自动修复
zdl --json                # 机器可读输出
zdl --rules cjk-latin-space,fullwidth-punct   # 只启用部分规则
zdl --ignore-rules heading-jump               # 禁用部分规则
zdl --list-rules                              # 列出所有规则
```

退出码：`0` 无问题，`1` 有问题，`2` 用法错误。

### 效果对比

修复前：

```markdown
# 用Node写的工具

这个工具用TypeScript写的,支持3种模式。你可以用`npm i`安装。

## 注意: 配置

配置文件在config.json里,注意大小写。

## 常见问题

真的吗??

好。。。
```

运行 `zdl --fix` 之后：

```markdown
# 用 Node 写的工具

这个工具用 TypeScript 写的，支持 3 种模式。你可以用`npm i`安装。

## 注意： 配置

配置文件在 config.json 里，注意大小写。

## 常见问题

真的吗？

好。
```

一次运行修掉 14 处，修完再跑一遍是 0 问题（修复是幂等的）。

## 规则

| 规则 | 说明 | 自动修复 |
|---|---|---|
| `cjk-latin-space` | 中英文/数字之间缺空格 | ✅ |
| `fullwidth-punct` | 中文句子里的半角标点应改为全角 | ✅ |
| `duplicated-punct` | 连续重复的全角标点 | ✅ |
| `space-before-punct` | 中文标点前多余的空格 | ✅ |
| `trailing-space` | 行尾多余空白 | ✅ |
| `repeated-word` | 疑似重复的词（的的、了了…） | ❌ 只提示 <!-- zdl-disable-line repeated-word --> |
| `heading-jump` | Markdown 标题层级跳跃（h1 → h3） | ❌ 只提示 |
| `unclosed-fence` | 代码围栏没有闭合 | ❌ 只提示 |

## 抑制误报

规则是启发式的，总有判断错的时候。用 HTML 注释写抑制指令（渲染后不可见，也不会被自己检查）：

```markdown
这一行确实要保留原样 <!-- zdl-disable-line -->

<!-- zdl-disable-next-line repeated-word -->
我们讨论的是"的的"这种重复词现象
```

- `zdl-disable-line` / `zdl-disable-next-line`
- 不写规则名 = 该行所有规则都跳过
- 写规则名（逗号或空格分隔）= 只跳过这几条

这个项目自己的 README 就用了这个机制——上面规则表里那句"的的、了了"正是被抑制的。 <!-- zdl-disable-line repeated-word -->

## 在 GitHub Actions 里用

```yaml
name: docs
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: LY3LY333/zh-docs-lint@v1
        with:
          paths: docs
```

`fix: true` 可以直接改写文件（配合 `git-auto-commit` 之类的步骤使用）。

## 它不会碰什么

这是这个工具最重要的设计约束——**绝不修改不该改的地方**：

- 行内代码 `` `npm run build` `` 里的内容
- 围栏代码块（```` ``` ```` / `~~~`）里的全部内容
- URL、邮箱、HTML 标签
- `版本1.0` 这种数字后紧跟字母的场景（不会把 `.` 变成 `。`）
- `e.g.` 这种英文缩写

实现上，每一行会先生成一份**遮罩副本**：把代码、URL、标签替换成占位符，规则只在遮罩上判断位置，再映射回原文。这样"检测位置"和"修改内容"永远不会错位。

## 已知限制

- **行内代码两侧不加空格**：`` 用`npm i`安装 `` 不会被改成 `` 用 `npm i` 安装 ``。代码片段被完整保护，这是有意的取舍（避免误改），后续版本会提供独立开关。
- **全角标点后的空格不处理**：`注意： 配置` 里的空格会保留。
- 只在中文语境下工作：纯英文文档不会报 `cjk-latin-space`，但也无法检查英文排版。
- `repeated-word` 的词典是刻意保守的（只查"的的""了了"这类），宁缺毋滥。 <!-- zdl-disable-line repeated-word -->

## 开发

```bash
node --test        # 57 个测试
```

代码结构：

| 文件 | 职责 |
|---|---|
| `src/document.js` | 分行、遮罩（代码/URL/标签）、围栏状态机 |
| `src/rules.js` | 8 条规则，纯函数，返回位置 + 可选修复 |
| `src/lint.js` | 汇总问题、应用修复、幂等循环 |
| `src/cli.js` | 参数解析、目录遍历、输出格式、退出码 |

## License

MIT © 2026 六月风
