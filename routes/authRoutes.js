const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, city } = req.body;
    if (!name || !email || !password || !city) {
      return res.status(400).json({ error: 'Preencha todos os campos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, city) VALUES ($1, $2, $3, $4) RETURNING id, name, email, city',
      [name, email.toLowerCase(), hash, city]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    // Sessão única: invalida todas as sessões anteriores do usuário
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    await pool.query(
      "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
      [user.id, token]
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, city: user.city }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.post('/logout', authRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE token = $1', [req.sessionToken]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao sair' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  const sub = await pool.query(
    `SELECT id, plan_code, plan_name, expires_at FROM subscriptions
     WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({
    user: req.user,
    subscription: sub.rowCount > 0 ? sub.rows[0] : null
  });
});

module.exports = router;