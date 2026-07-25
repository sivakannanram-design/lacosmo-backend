const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());

// We need raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const razorpay = new Razorpay({
  key_id: 'rzp_test_THfhMRJtsqlVO1',
  key_secret: 'A68VJ6R6lnWwkmYQZU1O7Guu',
});

// Temporary storage (in real app use a database)
const payments = {};

// Create Payment Link
app.post('/create-payment-link', async (req, res) => {
  try {
    const { amount, name, phone, address } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: Math.round(amount * 100), // in paise
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

    // Store initial status
    payments[paymentLink.id] = {
      status: 'created',
      amount: amount,
      name,
      phone,
      address,
      createdAt: new Date(),
    };

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
app.post('/webhook', (req, res) => {
  try {
    const secret = 'YOUR_WEBHOOK_SECRET'; // We will set this later
    const signature = req.headers['x-razorpay-signature'];

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(req.body);
    const digest = shasum.digest('hex');

    if (digest === signature) {
      const event = JSON.parse(req.body);

      console.log('Webhook Event:', event.event);

      if (event.event === 'payment_link.paid') {
        const paymentLinkId = event.payload.payment_link.entity.id;
        const paymentId = event.payload.payment.entity.id;

        if (payments[paymentLinkId]) {
          payments[paymentLinkId].status = 'paid';
          payments[paymentLinkId].paymentId = paymentId;
          payments[paymentLinkId].paidAt = new Date();
        }

        console.log('Payment successful for:', paymentLinkId);
      }

      res.status(200).json({ status: 'ok' });
    } else {
      res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Check payment status
app.get('/payment-status/:id', (req, res) => {
  const payment = payments[req.params.id];
  if (payment) {
    res.json({ success: true, ...payment });
  } else {
    res.status(404).json({ success: false, error: 'Payment not found' });
  }
});

app.get('/', (req, res) => {
  res.send('LA COSMO Backend is running with Webhooks');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
