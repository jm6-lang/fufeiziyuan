// 资源数据（硬编码，后续可换成 API 获取）
const RESOURCES = {
  tools: [
    {
      id: 'tool-001',
      name: 'PDF大师 Pro',
      category: 'tool',
      desc: '一款功能强大的 PDF 处理工具，支持合并、拆分、加密、转换等多种操作，适用于办公场景。',
      price: 5.9,
      size: '45.2 MB',
      thumb: '📄',
      file: 'tools/pdfmaster-pro.zip',
      version: 'v3.2.1'
    },
    {
      id: 'tool-002',
      name: '数据恢复精灵',
      category: 'tool',
      desc: '深度扫描硬盘，支持误删文件、格式化、分区丢失等场景的数据恢复，成功率高达 95%。',
      price: 5.9,
      size: '28.7 MB',
      thumb: '🔍',
      file: 'tools/data-recovery.exe',
      version: 'v5.0'
    },
    {
      id: 'tool-003',
      name: '思维导图 XMind',
      category: 'tool',
      desc: '简洁高效的思维导图软件，支持多种布局、云端同步，适合做计划、整理思路。',
      price: 5.9,
      size: '112 MB',
      thumb: '🧠',
      file: 'tools/xmind-2024.zip',
      version: 'v24.01'
    },
    {
      id: 'tool-004',
      name: '视频压缩器 Pro',
      category: 'tool',
      desc: '支持 H.264/H.265 多格式压缩，批量处理，压缩率高且保持画质，适合视频博主。',
      price: 5.9,
      size: '68 MB',
      thumb: '🎬',
      file: 'tools/video-compressor.zip',
      version: 'v2.8'
    }
  ],
  games: [
    {
      id: 'game-001',
      name: '星际争霸：重制版',
      category: 'game',
      desc: '经典 RTS 游戏重制版，4K 高清画质，重温星际战场，支持简体中文。',
      price: 5.9,
      size: '28 GB',
      thumb: '🚀',
      file: 'games/starcraft-remastered.zip',
      version: '完整版'
    },
    {
      id: 'game-002',
      name: '我的世界·国际版',
      category: 'game',
      desc: '全球最火的沙盒建造游戏，官方正版，多平台联机，支持 MOD 扩展。',
      price: 5.9,
      size: '1.2 GB',
      thumb: '⛏️',
      file: 'games/minecraft-pocket.apk',
      version: 'v1.21'
    },
    {
      id: 'game-003',
      name: '骑马与砍杀2：领主',
      category: 'game',
      desc: '中世纪冷兵器动作 RPG，大战场沙盒玩法，支持自定义战斗和攻城略地。',
      price: 5.9,
      size: '35 GB',
      thumb: '⚔️',
      file: 'games/mount-and-blade2.zip',
      version: 'v1.2.12'
    }
  ]
};

// 根据分类获取资源
function getByCategory(cat) {
  return RESOURCES[cat] || [];
}

// 根据 ID 获取资源
function getById(id) {
  for (const cat of Object.values(RESOURCES)) {
    for (const item of cat) {
      if (item.id === id) return item;
    }
  }
  return null;
}