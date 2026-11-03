# Skyward Realm — 天空浮空岛 · 40 秒镜头短片

<div align="center">

[**▶ Watch**](video/skyward_realm_40s.mp4) · [**Source**](src/) · [**Render pipeline**](video/README.md)

</div>

## 时间线

| 时间 | 镜头 | 运动 |
|------|------|------|
| 0–12s | 推进 | 从高远处缓慢推向岛屿，雨幕与云海展开 |
| 12–26s | 环绕 | 向左下沉环绕岛屿，露出瀑布、湿岩与遗迹 |
| 26–40s | 揭示 | 升起并拉远，鲸鱼、远景岛屿与风暴天空进入画面 |

相机关键帧见 [`src/cinema.ts`](src/cinema.ts)；总长 40 秒，30fps，1920×1080。

## 项目结构

```
claude-video/
├── src/
│   ├── main.ts          场景装配、交互轨道、?cine=1 确定性渲染
│   ├── cinema.ts        40 秒相机编排（3 段镜头，azimuth/elevation/distance/fov 关键帧）
│   ├── core/
│   │   ├── engine.ts    渲染器、合成器、更新循环
│   │   ├── math.ts      damp / clamp / mulberry32（种子随机）
│   │   └── glsl.ts      着色器工具
│   └── world/
│       ├── terrain.ts   浮空岛地形
│       ├── sky.ts       天空穹顶 + 环境光照
│       ├── clouds.ts    云海 + 云堤
│       ├── water.ts     瀑布 + 岛顶水体
│       ├── trees.ts     程序化树木
│       ├── ruins.ts     遗迹 + 发光符文
│       ├── whale.ts     巨鲸（揭示镜头主角）
│       ├── rain.ts      雨幕
│       ├── debris.ts    漂浮碎石
│       ├── crystals.ts  水晶簇
│       ├── distant.ts   远景岛屿
│       └── vegetation.ts 植被
├── video/
│   ├── skyward_realm_40s.mp4      成片（40s · 1280×720 · H.264）
│   ├── render-frames.mjs          headless Chrome 逐帧渲染（CDP）
│   ├── music_final.m4a            配乐
│   └── stills/                    关键帧截图
└── README.md
```

## 音乐

- 源文件：`music_final.m4a`
- 使用 16.0–56.0 秒片段，0.8 秒淡入、2 秒淡出。
- 节拍分析（scipy）：约 113 BPM；片段的能量峰值落在 42–44 秒，对应 26 秒开始的揭示镜头。

## 渲染管线

- `?cine=1` 模式关闭交互与实时循环，暴露 `window.__cine.renderAt(t)` 逐帧渲染，保证确定性。
- [`video/render-frames.mjs`](video/render-frames.mjs) 通过 Chrome DevTools Protocol 调用 `renderAt(t)` 并截取 1920×1080 PNG。
- 分镜时间基于 [`src/cinema.ts`](src/cinema.ts) 的相机关键帧；闪电为固定种子（第一次在 8.9s、18.6s、32.0s）。

## 复现

```bash
# dev server
npm run dev

# Chrome 调试实例
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu-sandbox --enable-unsafe-swiftshader --hide-scrollbars --mute-audio \
  --remote-debugging-port=9222 "--remote-allow-origins=*" \
  --user-data-dir=/tmp/cineprof --window-size=1920,1080 \
  "http://localhost:5173/?cine=1&noveil=1"

# 渲染帧
node video/render-frames.mjs video/frames 0 40 30 png

# 音频 + 编码 + 合成
ffmpeg -framerate 30 -i video/frames/%06d.png -i video/music_final.m4a \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 128k -shortest -movflags +faststart \
  video/skyward_realm_40s.mp4
```

快速检查：`?cine=1` 页面在 `?nowhale=1` 下可对比鲸鱼贡献；`nofog`、`noflash` 可分别关闭雾与闪电。

## 交互模式

`npm run dev` 后打开 `http://localhost:5173`（不带 `?cine=1`）进入实时交互：

- **拖拽** 环绕
- **滚轮** 缩放
- **双击** 回到主视角

URL 调试参数：`?az=` `?el=` `?dist=` `?ty=` `?fov=` 可直接设定相机；`?debug=1` 显示实时相机与包围盒信息。
