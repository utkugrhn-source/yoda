const { createClient } = require('redis');

let client = null;
async function getClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', () => { client = null; });
    await client.connect();
  }
  return client;
}

function hasScore(scores) {
  // Scores objesi gerçekten dolu mu? En az bir kriter > 0 olmalı
  if (!scores || typeof scores !== 'object') return false;
  return Object.values(scores).some(v => v && v > 0);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await getClient();

    if (req.method === 'POST') {
      const { charKey, qid, scores } = req.body;
      if (!charKey || !qid || !scores) return res.status(400).json({ error: 'Missing fields' });

      // Gelen skor dolu mu?
      if (!hasScore(scores)) return res.status(200).json({ ok: true, skipped: 'empty score' });

      // Redis'te zaten dolu bir skor var mı?
      const existing = await r.get(`vault:${charKey}:${qid}`);
      if (existing) {
        const existingScores = JSON.parse(existing);
        if (hasScore(existingScores)) {
          // İkisi de dolu — gelen skorları mevcut ile birleştir (kriter bazında dolu olan kazanır)
          const merged = { ...existingScores };
          Object.keys(scores).forEach(k => {
            if (scores[k] && scores[k] > 0) merged[k] = scores[k];
          });
          await r.set(`vault:${charKey}:${qid}`, JSON.stringify(merged));
          return res.status(200).json({ ok: true, merged: true });
        }
      }

      // Redis boş veya yeni soru — direkt yaz
      await r.set(`vault:${charKey}:${qid}`, JSON.stringify(scores));
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const keys = await r.keys('vault:*');
      const result = {};
      if (keys.length > 0) {
        const vals = await Promise.all(keys.map(k => r.get(k)));
        keys.forEach((k, i) => {
          const parts = k.split(':');
          const charKey = parts[1];
          const qid = parts.slice(2).join(':');
          if (!result[charKey]) result[charKey] = { scores: {} };
          result[charKey].scores[qid] = JSON.parse(vals[i]);
        });
      }
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
