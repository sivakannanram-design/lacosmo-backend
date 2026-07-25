const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());

// Raw body needed for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const razorpay = new Razorpay({
  key_id: 'rzp_test_THfhMRJtsqlVO1',
  key_secret: 'A68VJ6R6lnWwkmYQZU1O7Guu',
});

// Temporary storage
const payments = {};

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

// Webhook endpoint with error handling
app.post('/webhook', (req, res) => {
  try {
    const secret = 'lacosmo_secret_2026';
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      console.error('Webhook Error: Missing signature');
      return res.status(400).json({ error: 'Missing signature' });
    }

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(req.body);
    const digest = shasum.digest('hex');

    if (digest !== signature) {
      console.error('Webhook Error: Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (parseError) {
      console.error('Webhook Error: Failed to parse JSON', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('Webhook received:', event.event);

    if (event.event === 'payment_link.paid') {
      const paymentLinkId = event.payload?.payment_link?.entity?.id;
      const paymentId = event.payload?.payment?.entity?.id;

      if (paymentLinkId && payments[paymentLinkId]) {
        payments[paymentLinkId].status = 'paid';
        payments[paymentLinkId].paymentId = paymentId || null;
        payments[paymentLinkId].paidAt = new Date();
        console.log('Payment marked as PAID:', paymentLinkId);
      }
    }

    if (event.event === 'payment_link.expired') {
      const paymentLinkId = event.payload?.payment_link?.entity?.id;
      if (paymentLinkId && payments[paymentLinkId]) {
        payments[paymentLinkId].status = 'expired';
        console.log('Payment link expired:', paymentLinkId);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Unexpected Webhook Error:', error);
    res.status(200).json({ status: 'error_logged' });
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
