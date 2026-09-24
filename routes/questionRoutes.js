const router = require('express').Router();
const axios = require('axios');
const auth = require('../middleware/auth');

let cache = null;
let cacheTime = 0;

router.get('/questions', auth, async (req, res) => {
  if (cache && Date.now() - cacheTime < 600000) return res.json(cache);
  try {
    const { data } = await axios.get(
      `${process.env.SUPABASE_URL}/rest/v1/questions?select=*&order=id.asc&limit=1000`,
      { headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }, timeout: 10000 }
    );
    cache = { total: data.length, questions: data };
    cacheTime = Date.now();
    res.json(cache);
  } catch (e) {
    res.status(502).json({ error: 'Erro ao carregar questões do banco' });
  }
});

module.exports = router;
