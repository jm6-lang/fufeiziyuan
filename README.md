# 付费资源下载站

基于 GitHub + Cloudflare Pages（前端）+ Cloudflare Workers（后端）+ Cloudflare KV（用户数据）+ Cloudflare R2（文件存储）。

## 功能

- 🛠️ **工具板块** — 精选效率工具
- 🎮 **精品游戏** — 热门游戏资源
- 👤 **用户系统** — 注册 / 登录 / 会员体系
- 💎 **会员系统** — 月卡/年卡/终身会员，开通后免费下载全部资源
- 💳 **支付功能** — 微信/支付宝（需接入真实支付 API）
- 🚀 **边缘计算** — Cloudflare Workers 处理认证、购买、下载分发
- 📦 **对象存储** — Cloudflare R2 存储资源文件，高速下载

## 系统架构

```
用户浏览器
    ↓
Cloudflare Pages（静态前端）
    ↓  API 请求
Cloudflare Workers + KV
  ├─ /api/auth/register    注册
  ├─ /api/auth/login       登录
  ├─ /api/user/me          会员状态
  ├─ /api/purchase          购买资源
  ├─ /api/vip/activate      开通会员
  └─ /api/download?id=xxx   下载文件（R2）
    ↓
Cloudflare R2（文件存储）
```

## 目录结构

```
paid-download-site/
├── frontend/               # Cloudflare Pages 静态前端
│   ├── index.html          # 首页
│   ├── tool.html           # 工具板块
│   ├── game.html           # 精品游戏
│   ├── detail.html         # 资源详情/购买页
│   ├── login.html          # 登录/注册页
│   ├── user.html           # 用户中心
│   ├── css/style.css
│   └── js/
│       ├── data.js         # 资源数据
│       ├── main.js         # 列表渲染
│       ├── detail.js       # 详情页逻辑
│       └── auth.js         # 登录/会员/用户中心
│
├── workers/               # Cloudflare Workers 后端
│   ├── src/index.js        # 全部 API 逻辑
│   └── wrangler.toml       # KV + R2 绑定配置
│
└── resources/             # 资源文件（上传到 R2）
    ├── tools/
    └── games/
```

## 部署步骤

### 第一步：连接 GitHub → Cloudflare Pages

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Pages** → **创建项目**
2. 选择 **连接到 Git** → 选 `jm6-lang/fufeiziyuan` 仓库
3. **Root directory** 设置为 `frontend`
4. 其他留空（纯静态，不需要构建命令）
5. 点击**部署**，之后 push 代码自动触发部署

### 第二步：创建 KV 命名空间

1. Cloudflare Dashboard → **Workers & Pages** → **KV** → **创建命名空间**
2. 命名为 `users-kv`，创建后会得到一个 **ID**（格式 `xxxxxxxx-xxxx-...`）
3. 复制这个 ID，备用

### 第三步：创建 R2 Bucket

1. Cloudflare Dashboard → **R2** → **创建 Bucket**
2. 命名为 `paid-resources`
3. 点击 Bucket → **设置** → **允许公共访问**（或绑定自定义域名）
4. 记住 Bucket 名称

### 第四步：部署 Worker

```bash
cd workers
npm install

# 设置 KV 命名空间 ID（把下面的 xxx 替换为你的 KV ID）
# 方法：直接编辑 wrangler.toml 中的 id 字段
# 或运行：npx wrangler kv:namespace create USERS_KV

# 设置密码盐（必须！）
wrangler secret put PASSWORD_SALT
# 输入一个随机字符串（至少32位，建议64位随机字符串）

# 设置 KV 命名空间 ID（在 wrangler.toml 里改）
# 将 YOUR_KV_NAMESPACE_ID_HERE 替换为第二步的 ID

# 部署
npx wrangler deploy
```

### 第五步：上传资源文件到 R2

将资源文件上传到 R2 `paid-resources` Bucket，路径格式：
```
tools/文件名.zip
games/文件名.zip
```
路径必须与 `workers/src/index.js` 中 `ALLOWED_RESOURCES` 里的 `file` 字段一致。

### 第六步：配置 Worker 环境变量

在 Cloudflare Dashboard → Workers → 找到 `paid-download-worker` → **设置** → **环境变量**：
- `PASSWORD_SALT` — 随机字符串（已在第四步通过 secret 设置）

### 第七步：配置 Pages 到 Worker 的请求代理（可选）

如果前端和 Worker 部署在不同域名，需要让前端能调用 Worker API。

**方案 A（推荐）：给 Worker 设置自定义域名**
1. Worker → **设置** → **触发器** → **自定义域**
2. 添加一个子域名，如 `api.yourdomain.com`
3. 前端 `auth.js` 中 `API_BASE` 改为该域名

**方案 B：在 Pages 中设置重定向规则**
Pages 项目 → **触发器** → **自定义域** → 添加域名后，设置重定向：
- `/api/*` → `https://your-worker.workers.dev/api/*`

### 第八步：接入真实支付（可选）

目前是模拟支付。接入真实支付的方式：

**LemonSqueezy（推荐，支持微信/支付宝）**
1. 注册 [LemonSqueezy](https://lemonsqueezy.com/)，创建产品
2. 在 Worker 中：
   - `LEMONSQUEEZY_API_KEY` 和 `LEMONSQUEEZY_STORE_ID` 通过 `wrangler secret put` 设置
   - 在 `/api/purchase` 和 `/api/vip/activate` 中调用 LemonSqueezy API 创建 checkout
   - 配置 Webhook 回调到 `/api/webhook/lemonsqueezy`，验证签名后发货

**微信支付 / 支付宝**
- 可用 [unofficial-pay](https://github.com/c宽度) 等开源项目接入
- 或使用 [LemonSqueezy](https://lemonsqueezy.com/)（对中国用户更友好，内置微信/支付宝）

## KV 数据结构说明

| Key 格式 | 说明 |
|---|---|
| `user:{username}` | 用户信息 JSON |
| `email:{email}` | 用户名索引（防重复注册）|
| `token:{token}` | Session token → username（TTL: 7天）|

## 会员套餐

| 套餐 | 价格 | 说明 |
|---|---|---|
| 月卡会员 | ¥9.9/月 | 当月免费下载全部资源 |
| 年卡会员 | ¥59/年 | 当年免费下载 + 续费优惠 |
| 终身会员 | ¥199 | 一次购买，永久免费 |

## 本地预览

前端纯静态，直接用浏览器打开 `frontend/index.html` 即可预览。

Worker 本地调试：
```bash
cd workers
npx wrangler dev --local
```

---

**⚠️ 安全注意**：GitHub PAT 密钥不要明文分享在聊天中，用完即 revoke 并换新。
