const jwt = require('jsonwebtoken');
const pool = require('../database/db');

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token ausente' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const session = await pool.query(
      'SELECT id FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (session.rowCount === 0) {
      return res.status(401).json({ error: 'Sessão encerrada. Faça login novamente.' });
    }

    const user = await pool.query(
      'SELECT id, name, email, city FROM users WHERE id = $1',
      [payload.userId]
    );
    if (user.rowCount === 0) return res.status(401).json({ error: 'Usuário não encontrado' });

    req.user = user.rows[0];
    req.sessionToken = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

async function hasActiveSubscription(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id FROM subscriptions
       WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(403).json({ error: 'Acesso expirado. Renove seu plano.' });
    }
    req.subscription = result.rows[0];
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao verificar assinatura' });
  }
}

module.exports = { authRequired, hasActiveSubscription };