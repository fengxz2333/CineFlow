# 🎬 CineFlow — 发布包说明

> 构建日期：2026-04-06  
> 版本：1.0.0 (Portable)  
> 平台：Windows x64

---

## 📦 三套文件位置标注

```
P:\Cineflow_260406_00.4.6.00.56\
│
├── 📁 cineflow-asset-manager/          ← ① 完整源代码（开发用）
│   ├── src/                            # React + TypeScript 源码
│   ├── public/                         # 静态资源
│   ├── electron-main.js                # Electron 主进程
│   ├── package.json                    # 项目配置 & 依赖
│   ├── vite.config.ts                  # Vite 构建配置
│   └── README.md
│
├── 📁 CineFlow_Portable_Windows/       ← ② 免安装 EXE（分发用）
│   └── CineFlow.exe                    # 106MB → 双击即运行，无需安装
│
└── 📄 CineFlow_SourceCode_20260406.zip ← ③ 源码压缩包（归档/分享）
    (377MB，包含完整 node_modules)
```

### 各套用途

| 编号 | 内容 | 大小 | 用途 | 目标用户 |
|------|------|------|------|----------|
| **①** | 源代码目录 | ~500MB | 开发、修改、二次构建 | 开发者 |
| **②** | Portable EXE | **106MB** | **直接双击运行** | **所有用户** |
| **③** | ZIP 压缩包 | 377MB | 离线存档、网盘分享 | 所有人 |

---

## 🚀 使用方法

### 免安装 EXE（推荐）

1. 进入 `CineFlow_Portable_Windows` 文件夹
2. **双击 `CineFlow.exe`**
3. 首次启动可能需要几秒（Electron 初始化）
4. ✅ 完成！数据保存在 exe 同目录下，可拷贝到任何电脑

### 从源码运行

```bash
cd cineflow-asset-manager
npm install          # 安装依赖
npm run dev           # 开发模式 (http://localhost:3000)
npm run electron:dev # Electron 桌面版调试模式
npm run electron:build # 打包为 EXE
```

---

## 🌐 GitHub 开源发布指南

### 第一步：创建 GitHub 仓库

1. 打开 https://github.com/new
2. 仓库名：`CineFlow`（或自定义）
3. 描述：`🎬 专业影视后期创意资产管理工具 - 视频参考板、镜头管理、素材整理`
4. 选择 **Private** 或 **Public**
5. **不要**勾选 README / .gitignore / License（我们已有）
6. 点击 Create repository

### 第二步：上传源码

```bash
# 在本地源码目录操作
cd P:\Cineflow_260406_00.4.6.00.56\cineflow-asset-manager

git init
git add .
git commit -m "🎉 CineFlow v1.0.0 - 首次开源发布"

git remote add origin https://github.com/你的用户名/CineFlow.git
git branch -M main
git push -u origin main
```

### 第三步：创建 GitHub Release（附带 EXE 下载）

1. 进入仓库页面 → **Releases** → **Create a new release**
2. 版本号填：`v1.0.0`
3. 标题：`🎬 CineFlow v1.0.0 - Windows Portable`
4. 说明内容：

```markdown
## 🎬 CineFlow v1.0.0

专业影视后期创意资产管理工具。

### ✨ 功能亮点
- 🎬 视频参考板 — 导入、预览、分类管理视频参考素材
- 📸 图片参考画布 — PureRef 风格无限画布，拖拽排版
- 🎵 音乐/音效库 — 音频波形预览、播放、提取
- 🎞️ 镜头管理 — Shot 级别独立素材隔离
- 📦 资产库 — 统一素材归档
- 🔍 全文搜索 / 标签筛选

### 📥 下载

| 文件 | 说明 |
|------|------|
| `CineFlow.exe` | Windows 免安装版（双击运行） |

### 💻 从源码运行
```bash
npm install
npm run dev        # 浏览器模式
npm run electron:dev # 桌面模式
```
```

5. **拖放附件**：
   - 将 `CineFlow_Portable_Windows/CineFlow.exe` 拖入上传区域
   - （可选）也将 `CineFlow_SourceCode_20260406.zip` 作为 Source Code 上传
6. 点击 **Publish release**

### 第四步：（可选）添加 LICENSE 和 README

在仓库根目录创建或编辑：

**LICENSE** — 选 `MIT License`（最宽松）或 `Apache-2.0`：
- Settings → 左侧 "Add file" → "Choose a license"

**README.md** — 已有基础版本，可以补充截图和使用 GIF

---

## ⚠️ 注意事项

- EXE 基于 **Electron 41** 打包，兼容 Windows 10/11 64位
- 数据存储在用户目录的 AppData 中（IndexedDB），卸载不丢数据
- 首次打开可能被 Windows SmartScreen 拦截，点击"仍要运行"即可
- 如需分发给别人，只需把整个 `CineFlow_Portable_Windows` 文件夹发过去
