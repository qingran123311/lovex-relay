/* =====================================================
   LOVE♡X 分享封面中转 · EdgeOne Pages Functions 版
   路由：
     /api/relay?url=目标链接                       → 原样透传（页 HTML / 图字节）
     /api/relay?action=img&url=分享链接&i=0        → 只回第 i 张正文图的字节（小屏封面 & 图文翻页用）
   为什么要有 action=img（她 08-27 18:26：“不要标题卡，我的第一志愿永远是小屏和实际内容”）：
     浏览器 fetch 会被 EdgeOne 预览域名的鉴权中间件卡死（带 token→302 无 CORS 头，不带→401），
     但 <img> 子资源请求不受影响（实测带/不带 token 都能 200 出图）——所以让中转在服务端
     把“取页 + 挑图 + 取图”一趟做完，前端只用 img 标签挂上，跨域问题整体消失。
     顺带解决封面保质期：每次渲染实时回源取图，不怕抖音/小红书签名链过期，也不用存本机。
   安全：域名白名单，只转发这几站。
   ===================================================== */
const OK = /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)xiaohongshu\.com$|^xhslink\.com$|^xhslink\.cn$|(^|\.)bilibili\.com$|^b23\.tv$|(^|\.)hdslb\.com$|(^|\.)douyinpic\.com$|(^|\.)xhscdn\.com$/i;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const asText = (msg, code) => new Response(msg, { status: code, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });

/* 抖音分享页只对搜索引擎爬虫露真数据（普通 UA 拿到的是客户端渲染空壳）；小红书要电脑版页面才有图 */
const uaFor = host => (/douyin|iesdouyin/i.test(host) ? BOT_UA : PC_UA);

async function grab(target, ua) {
  return fetch(target, {
    redirect: 'follow',
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
}

/* 从分享页 HTML 里按出现顺序挑正文图；JSON 里的 \/ 转义和 &amp; 实体必须先还原，否则一条都匹配不上 */
function pickImgs(html, host) {
  const flat = String(html).replace(/\\\//g, '/').replace(/&amp;/g, '&');
  let out = [];
  if (/xiaohongshu|xhslink/i.test(host)) {
    out = (flat.match(/https?:\/\/sns-webpic[^"'\s\\<>)]+/g) || [])
      .concat((flat.match(/\/\/sns-webpic[^"'\s\\<>)]+/g) || []).map(u => 'https:' + u));
  } else {
    out = flat.match(/https:\/\/p\d[a-z0-9-]*\.douyinpic\.com\/[^"'\s\\<>)]+/g) || [];
  }
  const seen = new Set();
  const res = [];
  for (let u of out) {
    u = String(u).replace(/[),.;'"]+$/, '');
    if (!u || /avatar|logo|static|default_user/.test(u)) continue;   /* 头像/站点 logo/静态资源不是正文图 */
    if (!seen.has(u)) { seen.add(u); res.push(u); }
  }
  return res;
}

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const q = new URL(req.url).searchParams;
  const target = q.get('url') || '';
  const action = String(q.get('action') || '').toLowerCase();
  const idx = Math.max(0, parseInt(q.get('i') || '0', 10) || 0);
  let host = '';
  try { host = new URL(target).hostname.toLowerCase(); } catch (_) {}
  if (!/^https?:\/\//i.test(target) || !OK.test(host)) return asText('只允许转发抖音/小红书/B站域名', 403);

  try {
    if (action === 'img') {
      const pr = await grab(target, uaFor(host));
      const html = await pr.text();
      const list = pickImgs(html, host);
      if (!list.length) return asText('页里没找到正文图（作品可能已删，或这站又改了页面结构）', 404);
      if (idx >= list.length) return asText('这个作品只有 ' + list.length + ' 张图，没有第 ' + (idx + 1) + ' 张', 404);
      const referer = 'https://www.' + (/douyin|iesdouyin/i.test(host) ? 'douyin.com' : 'xiaohongshu.com') + '/';
      const ir = await fetch(list[idx], { headers: { 'User-Agent': PC_UA, 'Referer': referer } });
      if (!ir.ok || !ir.body) return asText('图取不到：上游 HTTP ' + ir.status, 502);
      return new Response(ir.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': ir.headers.get('Content-Type') || 'image/jpeg',
          /* 图可以缓存一小时：同一条链接反复渲染不用重复回源，省额度也快 */
          'Cache-Control': 'public, max-age=3600',
          'X-Image-Total': String(list.length),
        },
      });
    }
    /* 无 action：原样透传（老行为，页 HTML 和图字节同一通道，不会损坏） */
    const r = await grab(target, uaFor(host));
    return new Response(r.body, {
      status: r.ok ? 200 : 502,
      headers: {
        ...CORS,
        'Content-Type': r.headers.get('Content-Type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return asText('中转取页失败：' + (e && e.message ? e.message : e), 502);
  }
}

export default function onRequest(context) {
  return handle(context.request);
}
