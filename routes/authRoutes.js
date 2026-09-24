const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const auth = require('../middleware/auth');

router.post('/registrar', async (req, res) => {
  try {
    const { nome, email, whatsapp, cidade, senha } = req.body;
    if (!nome || !senha || (!email && !whatsapp)) {
      return res.status(400).json({ error: 'Nome, senha e ao menos um contato sao obrigatorios' });
    }
    if (!db) return res.status(503).json({ error: 'Banco de dados nao configurado' });
    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await db.query(
      'insert into public.usuarios (nome, email, whatsapp, cidade, senha_hash) values ($1,$2,$3,$4,$5) returning id',
      [nome, email || null, whatsapp || null, cidade || null, senhaHash]
    );
    const usuarioId = result.rows[0].id;
    const token = jwt.sign({ id: usuarioId, nome: nome }, process.env.JWT_SECRET || 'airways-secret', { expiresIn: '7d' });
    await db.query('update public.usuarios set session_token = $1 where id = $2', [token, usuarioId]);
    res.json({ token: token, usuario: { id: usuarioId, nome: nome, email: email, whatsapp: whatsapp, cidade: cidade } });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao registrar usuario' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, whatsapp, senha } = req.body;
    if (!senha || (!email && !whatsapp)) {
      return res.status(400).json({ error: 'Contato e senha sao obrigatorios' });
    }
    if (!db) return res.status(503).json({ error: 'Banco de dados nao configurado' });
    const result = await db.query('select * from public.usuarios where email = $1 or whatsapp = $1 limit 1', [email || whatsapp]);
    const usuario = result.rows[0];
    if (!usuario) return res.status(401).json({ error: 'Contato nao cadastrado' });
    const ok = await bcrypt.compare(senha, usuario.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
    const token = jwt.sign({ id: usuario.id, nome: usuario.nome }, process.env.JWT_SECRET || 'airways-secret', { expiresIn: '7d' });
    await db.query('update public.usuarios set session_token = $1 where id = $2', [token, usuario.id]);
    res.json({ token: token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, whatsapp: usuario.whatsapp, cidade: usuario.cidade } });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/me', auth, function (req, res) {
  res.json({ usuario: req.usuario });
});

module.exports = router;
