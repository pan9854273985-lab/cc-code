// Webhook for the lead bot @productodud_cc_bot. The bot delivers company leads (api/lead.js) to Jane
// (TELEGRAM_CHAT_ID) and to partners listed in TELEGRAM_EXTRA_CHAT_IDS (comma-separated Telegram IDs).
// Here it answers /start, so nobody hits silence: a known recipient sees the bot is alive; a new person gets
// a short reply, and Jane gets their Telegram ID to add to TELEGRAM_EXTRA_CHAT_IDS (Vercel, project cc-code), then redeploy.
// Connect once after deploy: open https://cc-code.marketing/api/tg?setup=1
import { createHmac } from 'node:crypto';

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const owner = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !owner) return res.status(404).json({ ok: false });
  const extra = String(process.env.TELEGRAM_EXTRA_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const call = (method, body) => fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => ({ ok: false }));
  // The webhook secret is derived from the token, so there is nothing extra to store
  const secret = createHmac('sha256', token).update('cc-lead-bot-v1').digest('hex');

  if (req.method === 'GET') {
    if (req.query.setup !== '1') return res.status(200).json({ ok: true });
    const r = await call('setWebhook', { url: 'https://cc-code.marketing/api/tg', secret_token: secret, allowed_updates: ['message'] });
    const me = await call('getMe', {});
    return res.status(200).json({ ok: !!r.ok, bot: me.result && me.result.username, error: r.ok ? undefined : r.description });
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).end();

  const m = req.body && req.body.message;
  if (m && m.chat && m.chat.type === 'private' && m.from && !m.from.is_bot) {
    const id = String(m.chat.id);
    const isStart = /^\/start\b/.test(m.text || '');
    if (id === owner || extra.includes(id)) {
      await call('sendMessage', { chat_id: id, text: 'Бот на связи ✅ Сюда приходят новые заявки от компаний на курсы.' });
    } else {
      await call('sendMessage', { chat_id: id, text: 'Привет! Это бот заявок от компаний на курсы ProductOdud. Женя получила уведомление: как только она вас добавит, новые заявки будут приходить сюда.' });
      if (isStart) {
        const who = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || 'Без имени';
        await call('sendMessage', {
          chat_id: owner,
          text: 'Бота заявок запустил(а) ' + who + (m.from.username ? ' @' + m.from.username : '') + ', Telegram ID ' + id +
            '.\nЧтобы заявки приходили и ему(ей), ID нужно добавить в TELEGRAM_EXTRA_CHAT_IDS (Vercel, проект cc-code) и выложить проект заново.',
        });
      }
    }
  }
  // Always 200, so Telegram doesn't resend the same update
  return res.status(200).json({ ok: true });
}
