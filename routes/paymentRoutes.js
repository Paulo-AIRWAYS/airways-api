const router = require('express').Router();
const axios = require('axios');
const db = require('../database/db');
const auth = require('../middleware/auth');

const IP_BASE = 'https://api.checkout.infinitepay.io';
const IP_HANDLE = process.env.IP_INFINITETAG;

// 1) Criar checkout (cartão de crédito)
router.post('/checkout', auth, async (req, res) => {
  const { plano_id } = req.body;
  const usuario_id = req.usuario.id;

  try {
    const plano = await db.query('select * from planos where id = $1', [plano_id]);
    if (!plano.rows.length) return res.status(400).json({ error: 'Plano inválido' });

    const p = plano.rows[0];
    const order_nsu = `aw-${usuario_id}-${Date.now()}`;

    // grava assinatura pendente
    const ass = await db.query(
      `insert into assinaturas (usuario_id, plano_id, gateway, status, pagamento_id)
       values ($1,$2,'infinitepay','pendente',$3) returning id`,
      [usuario_id, plano_id, order_nsu]
    );

    const payload = {
      handle: IP_HANDLE,
      items: [{ quantity: 1, price: p.preco_cartao, description: p.nome }],
      order_nsu,
      webhook_url: `${process.env.BASE_URL}/api/webhooks/infinitepay`,
      redirect_url: `${process.env.APP_URL}/obrigado`
    };

    const { data } = await axios.post(`${IP_BASE}/checkout`, payload);
    res.json({ url: data.url, order_nsu });
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.status(500).json({ error: 'Erro ao criar checkout' });
  }
});

// 2) Webhook de confirmação de pagamento
router.post('/webhooks/infinitepay', async (req, res) => {
  const body = req.body;
  res.status(200).json({ ok: true }); // responde rápido (200)

  try {
    const order_nsu = body.order_nsu;
    if (!order_nsu) return;

    const ass = await db.query('select * from assinaturas where pagamento_id = $1', [order_nsu]);
    if (!ass.rows.length) return;

    const a = ass.rows[0];
    if (a.status === 'ativo') return;

    const plano = await db.query('select * from planos where id = $1', [a.plano_id]);
    const dias = plano.rows[0].duracao_dias;
    const inicio = new Date();
    const fim = new Date(inicio.getTime() + dias * 86400000);

    await db.query(
      `update assinaturas set status='ativo', data_inicio=$1, data_fim=$2 where id=$3`,
      [inicio, fim, a.id]
    );
  } catch (e) {
    console.error('webhook infinitepay', e.message);
  }
});

// 3) Consultar status (fallback de segurança)
router.post('/payment-check', auth, async (req, res) => {
  const { order_nsu, transaction_nsu, slug } = req.body;
  try {
    const { data } = await axios.post(`${IP_BASE}/payment_check`, {
      handle: IP_HANDLE, order_nsu, transaction_nsu, slug
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao consultar pagamento' });
  }
});

module.exports = router;
