const express = require('express');
const axios = require('axios');
const pool = require('../database/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const PLANS = {
  '15d':  { days: 15,  name: 'Teste 15 dias',      amount: 1490 },
  '30d':  { days: 30,  name: 'Básico 30 dias',     amount: 2290 },
  '60d':  { days: 60,  name: 'Essencial 60 dias',  amount: 3990 },
  '90d':  { days: 90,  name: 'Avançado 90 dias',   amount: 5490 },
  '180d': { days: 180, name: 'Semestral 180 dias', amount: 8990 },
  '365d': { days: 365, name: 'Anual 365 dias',     amount: 14990 }
};

async function getCoraToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  const resp = await axios.post('https://api.cora.com.br/v1/token', params, {
    auth: {
      username: process.env.CORA_CLIENT_ID,
      password: process.env.CORA_CLIENT_SECRET
    }
  });
  return resp.data.access_token;
}

router.post('/pix', authRequired, async (req, res) => {
  try {
    const { planCode } = req.body;
    const plan = PLANS[planCode];
    if (!plan) return res.status(400).json({ error: 'Plano inválido' });

    const token = await getCoraToken();
    const payload = {
      name: plan.name + ' - AIRWAYS',
      customer: {
        name: req.user.name,
        email: req.user.email
      },
      services: [{ name: 'Acesso Plataforma Simulados ANAC', amount: plan.amount }],
      payment_forms: ['PIX']
    };

    const resp = await axios.post('https://api.cora.com.br/v1/cobrancas', payload, {
      headers: { Authorization: 'Bearer ' + token }
    });

    await pool.query(
      'INSERT INTO pending_charges (user_id, plan_code, gateway_transaction_id) VALUES ($1, $2, $3)',
      [req.user.id, planCode, resp.data.id]
    );

    res.json({
      chargeId: resp.data.id,
      qrCode: resp.data.pix.qr_code,
      qrCodeImage: resp.data.pix.qr_code_image,
      copyPaste: resp.data.pix.copy_paste
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar cobrança PIX' });
  }
});

router.post('/card', authRequired, async (req, res) => {
  try {
    const { planCode } = req.body;
    const plan = PLANS[planCode];
    if (!plan) return res.status(400).json({ error: 'Plano inválido' });

    const resp = await axios.post('https://api.infinitepay.io/v2/checkouts', {
      amount: plan.amount,
      currency: 'BRL',
      order_id: 'SUB-' + planCode + '-' + req.user.id,
      customer: {
        first_name: req.user.name.split(' ')[0],
        last_name: req.user.name.split(' ').slice(1).join(' ') || 'Aluno',
        email: req.user.email
      },
      payment_methods: ['credit_card'],
      installments: 12,
      redirect_url: process.env.FRONTEND_URL + '/sucesso',
      webhook_url: process.env.FRONTEND_URL.replace('app', 'api') + '/api/webhook/infinitepay'
    }, {
      headers: { Authorization: 'Bearer ' + process.env.INFINITEPAY_API_KEY }
    });

    res.json({ checkoutUrl: resp.data.checkout_url, checkoutId: resp.data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar checkout de cartão' });
  }
});

async function activateSubscription(userId, planCode, paymentMethod, gatewayTransactionId) {
  const plan = PLANS[planCode];
  if (!plan) return;
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_code, plan_name, amount_cents, payment_method, gateway_transaction_id, starts_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + ($7 || ' days')::interval)`,
    [userId, planCode, plan.name, plan.amount, paymentMethod, gatewayTransactionId, plan.days]
  );
}

router.post('/webhook/cora', async (req, res) => {
  try {
    const event = req.body;
    if (event.type === 'PIX_PAYMENT_CONFIRMED' || event.status === 'paid') {
      const chargeId = event.charge_id || event.id;
      const charge = await pool.query(
        'SELECT user_id, plan_code FROM pending_charges WHERE gateway_transaction_id = $1',
        [chargeId]
      );
      if (charge.rowCount > 0) {
        await activateSubscription(charge.rows[0].user_id, charge.rows[0].plan_code, 'PIX', chargeId);
        await pool.query('DELETE FROM pending_charges WHERE gateway_transaction_id = $1', [chargeId]);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no webhook' });
  }
});

router.post('/webhook/infinitepay', async (req, res) => {
  try {
    const event = req.body;
    if (event.status === 'paid' || event.status === 'approved') {
      const orderId = event.order_id || '';
      const match = orderId.match(/^SUB-(\d+d)-(\d+)$/);
      if (match) {
        await activateSubscription(Number(match[2]), match[1], 'CARD', event.id);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no webhook' });
  }
});

module.exports = router;