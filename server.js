const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
app.use(cors());

// Raw body for webhook
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb+srv://sivakannanram_db_user:TnTjo7BuaPrXuCLy@cluster0.ehoytmm.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Payment Schema
const paymentSchema = new mongoose.Schema({
  paymentLinkId: { type: String, required: true, unique: true },
  status: { type: String, default: 'created' },
  amount: Number,
  name: String,
  phone: String,
  address: String,
  paymentId: String,
  createdAt: { type: Date, default: Date.now },
  paidAt: Date,
});

const Payment = mongoose.model('Payment', paymentSchema);

const razorpay = new Razorpay({
  key_id: 'rzp_test_THfhMRJtsqlVO1',
  key_secret: 'A68VJ6R6lnWwkmYQZU1O7Guu',
});

// Create Payment Link
app.post('/create-payment-link', async (req, res) => {
  try {
    const { amount, name, phone, address } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      accept_partial: false,
      description: 'LA COSMO Order',
      customer: {
        name: name || 'Customer',
        contact: phone || '',
      },
      notify: {
        sms: true,
        email: false,
      },
      reminder_enable: true,
      notes: {
        address: address || '',
      },
    });

    // Save to database
    await Payment.create({
      paymentLinkId: paymentLink.id,
      status: 'created',
      amount,
      name,
      phone,
      address,
    });

    res.json({
      success: true,
      payment_link: paymentLink.short_url,
      id: paymentLink.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const secret = 'lacosmo_secret_2026';
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(req.body);
    const digest = shasum.digest('hex');

    if (digest !== signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());
    console.log('Webhook received:', event.event);

    if (event.event === 'payment_link.paid') {
      const paymentLinkId = event.payload?.payment_link?.entity?.id;
      const paymentId = event.payload?.payment?.entity?.id;

      if (paymentLinkId) {
        await Payment.findOneAndUpdate(
          { paymentLinkId },
          {
            status: 'paid',
            paymentId: paymentId || null,
            paidAt: new Date(),
          }
        );
        console.log('Payment marked as PAID:', paymentLinkId);
      }
    }

    if (event.event === 'payment_link.expired') {
      const paymentLinkId = event.payload?.payment_link?.entity?.id;
      if (paymentLinkId) {
        await Payment.findOneAndUpdate(
          { paymentLinkId },
          { status: 'expired' }
        );
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(200).json({ status: 'error_logged' });
  }
});

// Check payment status
app.get('/payment-status/:id', async (req, res) => {
  try {
    const payment = await Payment.findOne({ paymentLinkId: req.params.id });
    if (payment) {
      res.json({ success: true, ...payment.toObject() });
    } else {
      res.status(404).json({ success: false, error: 'Payment not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('LA COSMO Backend is running with MongoDB');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
