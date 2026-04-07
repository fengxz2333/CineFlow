# CineFlow Production

<div align="center">

**桌面端影视资产管理工具 · 面向个人创作者**

`v0.4.6` · 2026年4月

[![Download](https://img.shields.io/badge/📥-下载exe-blue?style=flat-square)](https://github.com/fengxz2333/CineFlow/releases)
[![Platform](https://img.shields.io/badge/平台-Windows%20x64-blue)](https://github.com/fengxz2333/CineFlow)
[![License](https://img.shields.io/badge/协议-MIT-green)](LICENSE)

</div>

---

## 起点：一个创作者的真实困境

做过两三个并行项目之后，你会发现一个尴尬的事实：**最难管的不是创作本身，而是文件。**

素材散落在各个角落——D盘的"参考"文件夹、微信传输助手、浏览器收藏夹、移动硬盘里的某个子目录。找一张三个月前存的角色参考图，翻来覆去要十五分钟。更离谱的是，有时候找文件靠的是翻企微聊天记录——"那个文件你发过我的，我搜一下聊天记录"——一个创作者的时间就这样耗在了找文件上。

> ShotGrid、ftrack、CG-Workflow 这些制片管理平台确实强大，但它们面向的是几十人的工作室流程。对一个人或三五个人的小团队来说，配置成本、学习门槛和价格都不现实。
>
> 而另一端，大部分人最终退回到 **"文件夹 + Excel 表格 + 命名规范"** 的手工作坊模式——能跑，但每次都在重复低效劳动。

中间这块空白，就是 CineFlow 想填的位置：

> **一个不需要服务器配置、不需要团队培训、打开就能用的个人创作资产管理工具。**

<p align="center">
<img src="docs/screenshots/01_home.png" alt="首页" width="720" />
</p>
<p align="center"><em>首页 — 新建项目 / 选择已有项目，或拖入文件自动分镜</em></p>

---

## 它做了什么

### 视频导入即拆分 🎬

把一段视频拖进 CineFlow，系统自动检测场景切换点，把视频按镜头切分开。确认后直接创建一个新项目，每个切出来的片段自动落入对应镜头的分镜阶段。从拿到原片到看到完整的镜头列表，**中间没有手动打点、导出、建文件夹这些步骤**。

<p align="center">
<img src="docs/screenshots/02_detect.png" alt="智能场景检测" width="640" />
</p>
<p align="center"><em>智能场景检测进行中，逐帧分析画面变化</em></p>

<p align="center">
<img src="docs/screenshots/03_timeline.png" alt="时间轴视图" width="480" />
<img src="docs/screenshots/04_cutpoint.png" alt="剪辑点标记" width="480" />
</p>
<p align="center"><em>检测完成后的时间轴视图，可拖拽调整剪辑点</em></p>

> 一段 10 分钟的参考片 → 自动识别出 17 个剪辑点 → 用户微调后确认 → 新项目创建完成，17 个镜头各自携带对应的视频片段，缩略图已就位。**整个过程不到两分钟。**

<p align="center">
<img src="docs/screenshots/05_confirm.png" alt="确认生成镜头" width="560" />
</p>
<p align="center"><em>输入新项目名称后确认，自动创建项目并切分视频</em></p>

---

### 项目看板 📋

每个项目的界面分为四个区域：

- **左侧镜头列** — 所有镜头以卡片形式排列，带编号、缩略图和状态色标
- **阶段导航** — 9 个制作阶段（创意→分镜→预演→资产→动画→特效→灯光→合成），每个阶段独立统计进度
- **顶部仪表盘** — 整体完成度环形图、各状态分布、阻塞提醒
- **右侧版本区** — 选中某个镜头的某个阶段后，显示该组合下的所有版本文件（v001、v002…）

打开一个项目，当前进度一目了然。不用去猜哪个镜头卡住了，不用翻聊天记录确认"最新版是第几版"。

<p align="center">
<img src="docs/screenshots/06_board_full.png" alt="项目看板全貌" width="520" />
<img src="docs/screenshots/07_dashboard.png" alt="仪表盘与阶段导航" width="520" />
</p>
<p align="center"><em>9 阶段导航 + AI 健康度仪表盘 + 右侧版本文件列表</em></p>

<p align="center">
<img src="docs/screenshots/08_player.png" alt="镜头视频播放器" width="800" />
</p>
<p align="center"><em>选中镜头后的视频播放预览（含版本切换）</em></p>

---

### 创意文件库 🖼️

内置全局素材库，按六大类组织：图片参考、视频参考、音乐参考、音效、资产库、串片索引。支持单个文件拖入、ZIP 批量解压导入，文件进来之后自动分类归档。跨项目也能引用——A 项目存的参考图，B 项目可以直接调用。

**核心思路很简单：文件只存一次，需要时自己找得到。**

<p align="center">
<img src="docs/screenshots/09_creative_categories.png" alt="创意面板六大分类" width="500" />
<img src="docs/screenshots/10_video_grid.png" alt="视频参考网格浏览" width="500" />
</p>
<p align="center"><em>创意面板 — 六大素材分类入口 / 视频参考库网格浏览</em></p>

---

### 串片与对比 🔍

各镜头版本准备好之后，可以在内置串片中按顺序播放，调整排序和出入点，快速拼出导演审阅版或客户汇报版。同一镜头的不同版本之间支持**分屏同步对比、叠加差异查看、画中画参照**。

<p align="center">
<img src="docs/screenshots/11_zip_import.png" alt="压缩包解压预览" width="500" />
<img src="docs/screenshots/12_ai_chat.png" alt="刀盾AI对话" width="500" />
</p>
<p align="center"><em>压缩包自动解压预览 / 刀盾 AI 对话式操作</em></p>

<p align="center">
<img src="docs/screenshots/14_import_source.png" alt="选择导入来源" width="600" />
</p>
<p align="center"><em>选择导入来源（推荐阶段 / 全部阶段）</em></p>

---

## 现在的状态

CineFlow 目前是 **v0.4.x 的半成品**。上面描述的功能已经可以实际使用，但距离完整产品还有明显差距：

<details>
<summary><b>⚠ 已知限制（点击展开）</b></summary>

- 视频切分基于浏览器端 MediaRecorder 实现，超过 30 分钟的长视频处理较慢（预计 3-8 分钟）
- 数据存储在本机 IndexedDB，暂不支持云同步和多设备协同
- 切分输出为 WebM 格式，如需 MP4 用于其他软件需额外转换
- 团队协作功能尚未开发，目前仅支持单用户

</details>

<details>
<summary><b>🔧 已经在做的事（点击展开）</b></summary>

- 探索 WebCodec API 和 WASM-FFmpeg 方案提升切分性能
- 云端存储方案在规划中
- 批量操作、快捷键覆盖、EDL/XML 导出等功能排期中

</details>

核心链路已经跑通了——从导入到切分到看板到版本管理这条主线。与其闭门打磨到"完美"，不如让实际使用中的问题来决定下一步优先做什么。

---

## 适合谁用 👤

| 用户 | 场景 |
|------|------|
| 独立动画师 | 从参考收集到最终合成的全流程资产在一个地方管起来 |
| 自由剪辑师 / 短视频创作者 | 替代"文件夹+Excel"的管理方式 |
| 学生设计团队 | 毕设或课程作业的项目管理和版本追踪 |
| 小型工作室（1-5人） | 正式上 ShotGrid 之前的轻量方案 |

---

## 彩蛋 🤖

如果你觉得手动导入文件还是太麻烦，可以交给 CineFlow 内置的**"刀盾"**——它支持拖入压缩包自动解压识别、批量分类导入。后续版本还会开放大模型 API 接入，你可以用自然语言跟素材库对话："帮我找出所有暖色调的参考图"、"把这套角色设定分配到项目 B 的资产阶段"。比比拉布。

---

## 下载运行 ⬇️

### 方式一：直接下载 exe（推荐免安装）

1. 前往 [Releases](https://github.com/fengxz2333/CineFlow/releases) 页面
2. 下载 `CineFlow.exe`
3. 双击即可运行，无需安装

### 方式二：从源码构建

```bash
git clone https://github.com/fengxz2333/CineFlow.git
cd cineflow-asset-manager
npm install
npm run dev          # 浏览器模式
npm run electron:dev  # Electron 桌面模式
```

> **环境要求**：Node.js 18+ / Windows 10+ (64位)

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 41 |
| 前端框架 | React 19 + TypeScript 5.8 |
| 构建工具 | Vite 6 |
| 样式方案 | Tailwind CSS 4 |
| 数据存储 | Dexie (IndexedDB) |
| AI 能力 | Google Gemini API |

---

<div align="center">

**先解决自己的问题，再看能不能帮到别人**

Made with ❤️ by [fengxz2333](https://github.com/fengxz2333)

</div>
