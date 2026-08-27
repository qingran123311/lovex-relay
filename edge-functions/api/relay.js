/* =====================================================
   LOVE♡X 分享封面中转 · EdgeOne Pages Functions 版
   路由：部署后访问  https://你的域名/api/relay?url=目标链接
   说明：为什么换掉 Cloudflare——workers.dev 在国内被墙，
   且 Cloudflare 海外出机房拉抖音/小红书会被反爬区别对待。
   EdgeOne 的节点拉国内站没有这两层问题。
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

export default function onRequest(context) {
  return handle(context.request);
}

async function handle(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const target = new URL(req.url).searchParams.get('url') || '';
  const txt = (msg, code) => new Response(msg, { status: code, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  let host = '';
  try { host = new URL(target).hostname.toLowerCase(); } catch (_) {}
  if (!/^https?:\/\//i.test(target) || !OK.test(host)) return txt('只允许转发抖音/小红书/B站域名', 403);
  try {
    const r = await fetch(target, {
      redirect: 'follow',
      headers: {
        // 抖音的分享页只对爬虫露真数据，小红书正常手机 UA 即可
        'User-Agent': /douyin/i.test(host) ? BOT_UA : PC_UA,  // 小红书用电脑版 UA 才有 og:image（手机版页面图藏在别处）
        'Accept': 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    // 二进制透传：页 HTML 和封面图同一通道，图不会被损坏
    return new Response(r.body, {
      status: r.ok ? 200 : 502,
      headers: {
        ...CORS,
        'Content-Type': r.headers.get('Content-Type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return txt('中转取页失败：' + (e && e.message ? e.message : e), 502);
  }
}