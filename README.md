# 付费资源下载站

基于 GitHub + Cloudflare Pages 自动部署的付费资源下载网站。

## 功能

- 🛠️ **工具板块** — 精选效率工具付费下载
- 🎮 **精品游戏** — 热门游戏资源付费下载
- 💳 **支付功能** — 支持微信 / 支付宝（需接入真实支付 API）
- 🚀 **边缘计算** — Cloudflare Workers 处理付费验证与文件分发
- 📦 **对象存储** — Cloudflare R2 存储资源文件，高速下载

## 架构

```
用户浏览器
    ↓ 点击下载
Cloudflare Worker（验证付费令牌）
    ↓ 令牌有效
Cloudflare R2（文件存储）
    ↓
用户下载文件
```

## 目录结构

```
paid-download-site/
├── frontend/           # Cloudflare Pages 静态前端
│   ├── index.html       # 首页
│   ├── tool.html        # 工具板块
│   ├── game.html        # 精品游戏
│   ├── detail.html      # 资源详情/购买页
│   ├── css/style.css
│   └── js/
│       ├── data.js      # 资源数据
│       ├── main.js      # 列表渲染
│       └── detail.js    # 详情页逻辑
│
├── workers/             # Cloudflare Workers 付费逻辑
│   ├── src/index.js     # Worker 主文件
│   └── wrangler.toml    # 部署配置
│
└── resources/           # 资源文件（上传到 R2）
    ├── tools/
    └── games/
```

## 部署步骤

### 1. 创建 Cloudflare R2 Bucket

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2
2. 创建 Bucket，命名为 `paid-resources`（名字需与 wrangler.toml 一致）
3. 设置为**公开访问**或配置自定义域名

### 2. 配置 Cloudflare Worker

```bash
cd workers
npm install

# 设置密钥（生产环境必须）
wrangler secret put DOWNLOAD_SECRET
# 输入一个复杂的随机字符串

# 部署 Worker
wrangler deploy
```

### 3. 上传资源文件到 R2

将资源文件上传到 R2 的 `paid-resources` Bucket，路径格式：
```
tools/文件名.zip
games/文件名.zip
```

### 4. 连接 GitHub 部署前端

1. 进入 Cloudflare Pages → 创建项目
2. 选择 `paid-download-site/frontend` 目录
3. 设置 **Root directory** 为 `frontend`
4. 连接 GitHub 仓库，之后每次 push 自动部署

### 5. 配置支付（待接入）

支付部分需要接入真实支付渠道，推荐：
- **LemonSqueezy** — 支持微信/支付宝，面向中国开发者友好
- **Stripe** — 国际支付
- **微信支付** — 通过 cloudflare-worker-wechatpay 等开源项目接入
- **支付宝** — 同上

接入方式：在 Worker 的 `/api/generate-token` 中验证支付状态后再发放下载令牌。

## 本地预览

```bash
# 直接用浏览器打开 frontend/index.html 即可预览
# 或使用 VS Code Live Server 插件
```

## 注意事项

- `workers/src/index.js` 中的令牌机制为简化版演示，生产环境请改用 HMAC-SHA256 签名
- 支付验证逻辑需根据实际接入的支付平台（Stripe/LemonSqueezy/微信/支付宝）完善
- R2 Bucket 需正确配置 CORS 跨域策略