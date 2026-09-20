require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const questionRoutes = require('./routes/questionRoutes');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/questions', questionRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('AIRWAYS backend rodando na porta ' + PORT));