const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../database/db');

const PLANOS = {
  '30d':  { nome: 'Plano 30 dias',   dias: 30,  preco: 2990 },
  '60d':  { nome: 'Plano 60 dias',   dias: 60,  preco: 4990 },
  '90d':  { nome: 'Plano 90 dias',   dias: 90,  preco: 5990 },
  '180d': { nome: 'Plano 180 dias',  dias: 180, preco: 8990 },
  '1a':   { nome: 'Plano Anual',     dias: 365, preco: 11990 }
};

router.get('/planos', function (req, res) {
  res.json({ planos: Object.keys(PLANOS).map(function (id) {
    return { id: id, nome: PLANOS[id].nome, dias: PLANOS[id].dias, preco: PLANOS[id].preco };
  }) });
});

router.post('/checkout', auth, async function (req, res) {
  try {
    const planoId = req.body.planoId;
    const plano = PLANOS[planoId];
    if (!plano) return res.status(400).json({ error: 'Plano invalido' });
    if (!req.usuario || !req.usuario.id) return res.status(401).json({ error: 'Usuario nao identificado' });
    if (!db) return res.status(503).json({ error: 'Banco de dados nao configurado' });

    const result = await db.query(
      'insert into public.assinaturas (usuario_id, plano_id, gateway, status) values ($1, $2, $3, $4) returning id',
      [req.usuario.id, planoId, 'manual', 'pendente']
    );

    res.json({
      assinaturaId: result.rows[0].id,
      plano: plano,
      status: 'pendente',
      mensagem: 'Pagamento manual: confirme o PIX ou cartao pelo app'
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar assinatura' });
  }
});

router.post('/confirmar', auth, async function (req, res) {
  try {
    const assinaturaId = req.body.assinaturaId;
    if (!assinaturaId) return res.status(400).json({ error: 'Assinatura nao informada' });
    if (!db) return res.status(503).json({ error: 'Banco de dados nao configurado' });

    const plano = await db.query(
      'select p.duracao_dias from public.assinaturas a join public.planos p on p.id = a.plano_id where a.id = $1',
      [assinaturaId]
    );
    if (!plano.rows[0]) return res.status(404).json({ error: 'Assinatura nao encontrada' });

    const dias = plano.rows[0].duracao_dias;
    const fim = new Date(Date.now() + dias * 86400000);

    await db.query(
      'update public.assinaturas set status = $1, data_inicio = now(), data_fim = $2 where id = $3',
      ['ativa', fim, assinaturaId]
    );

    res.json({ status: 'ativa', dataFim: fim });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao confirmar assinatura' });
  }
});

module.exports = router;
