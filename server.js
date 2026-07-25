const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());

app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// MongoDB
mongoose.connect('mongodb+srv://sivakannanram_db_user:TnTjo7BuaPrXuCLy@cluster0.ehoytmm.mongodb.net/?retryWrites=true&w=majority')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

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

// ========== EMAIL SETUP ==========
// Using Gmail (you need an App Password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'itslacosmo@gmail.com',          // Your Gmail
    pass: 'YOUR_GMAIL_APP_PASSWORD',       // ← Replace this
  },
});

// Send email function
async function sendEmails(payment) {
  try {
    // 1. Notification to Store Owner
    await transporter.sendMail({
      from: '"LA COSMO Orders" <itslacosmo@gmail.com>',
      to: 'contact@lacosmo.in',
      subject: `New Order Received - ₹${payment.amount}`,
      html: `
        <h2>New Order Received</h2>
        <p><strong>Customer Name:</strong> ${payment.name}</p>
        <p><strong>Phone:</strong> ${payment.phone}</p>
        <p><strong>Address:</strong> ${payment.address}</p>
        <p><strong>Amount:</strong> ₹${payment.amount}</p>
        <p><strong>Payment ID:</strong> ${payment.paymentId || 'N/A'}</p>
        <p><strong>Status:</strong> Paid</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `,
    });

    // 2. Confirmation to Customer (using phone as we don't have email yet)
    // For now we send to owner only. We can add customer email later.
    console.log('Owner notification sent successfully');
  } catch (error) {
    console.error('Email error:', error);
  }
}

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

// Webhook
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
        const payment = await Payment.findOneAndUpdate(
          { paymentLinkId },
          {
            status: 'paid',
            paymentId: paymentId || null,
            paidAt: new Date(),
          },
          { new: true }
        );

        if (payment) {
          // Send email notifications
          await sendEmails(payment);
          console.log('Payment marked as PAID + Emails sent:', paymentLinkId);
        }
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
  res.send('LA COSMO Backend is running with Email Notifications');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
