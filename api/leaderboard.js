export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return res.status(500).json({ error: 'Missing KV config (KV_REST_API_URL / KV_REST_API_TOKEN)' });
  }

  const GAMES = ['tetris','dodge','snake','pong','clicker','memory'];

  async function kv(path, options = {}) {
    const r = await fetch(`${url}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!r.ok) throw new Error(`KV ${r.status}`);
    return r.json();
  }

  try {
    if (req.method === 'GET') {
      const out = {};
      for (const g of GAMES) {
        const data = await kv(`/zrange/lb:${g}/0/19/REV/WITHSCORES`);
        const arr = data?.result || [];
        const rows = [];
        for (let i = 0; i < arr.length; i += 2) {
          rows.push({ name: arr[i], score: Number(arr[i + 1] || 0), game: g });
        }
        out[g] = rows;
      }
      return res.status(200).json({ ok: true, boards: out });
    }

    if (req.method === 'POST') {
      const { game, name, score } = req.body || {};
      if (!GAMES.includes(game)) return res.status(400).json({ error: 'Invalid game' });
      const cleanName = String(name || 'Player').slice(0, 24);
      const s = Number(score || 0);
      if (!Number.isFinite(s)) return res.status(400).json({ error: 'Invalid score' });

      await kv(`/zadd/lb:${game}/${s}/${encodeURIComponent(cleanName)}`, { method: 'POST' });
      await kv(`/zremrangebyrank/lb:${game}/0/-51`, { method: 'POST' });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
