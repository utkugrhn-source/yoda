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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await getClient();

    // POST — veri kaydet
    if (req.method === 'POST') {
      const { charKey, qid, scores } = req.body;
      if (!charKey || !qid || !scores) return res.status(400).json({ error: 'Missing fields' });
      // Key: vault:{charKey}:{qid}
      await r.set(`vault:${charKey}:${qid}`, JSON.stringify(scores));
      return res.status(200).json({ ok: true });
    }

    // GET — tüm veriyi oku
    if (req.method === 'GET') {
      const keys = await r.keys('vault:*');
      const result = {};
      if (keys.length > 0) {
        const vals = await Promise.all(keys.map(k => r.get(k)));
        keys.forEach((k, i) => {
          const parts = k.split(':'); // vault:charKey:qid
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
