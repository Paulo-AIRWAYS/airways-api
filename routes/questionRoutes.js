const router = require('express').Router();
const axios = require('axios');

router.get('/questions', async (req, res) => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.json({ total: 0, questions: [] });
    }
    const url = process.env.SUPABASE_URL + '/rest/v1/questions?select=*&order=id.asc&limit=1000';
    const { data } = await axios.get(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_KEY
      },
      timeout: 10000
    });
    res.json({ total: data.length, questions: data });
  } catch (e) {
    res.status(502).json({ error: 'Erro ao carregar questões do banco' });
  }
});

module.exports = router;
