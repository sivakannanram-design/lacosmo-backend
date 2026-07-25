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

// ====================== DATABASE ======================
const MONGODB_URI = 'mongodb+srv://sivakannanram_db_user:TnTjo7BuaPrXuCLy@cluster0.ehoytmm.mongodb.net/?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
})
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB connection error:', err.message));

const paymentSchema = new mongoose.Schema({
  paymentLinkId: { type: String, required: true, unique: true },
  status: { type: String, default: 'created' },
  amount: Number,
  name: String,
  email: String,
  phone: String,
  address: String,
  paymentId: String,
  items: Array,
  createdAt: { type: Date, default: Date.now },
  paidAt: Date,
});

const Payment = mongoose.model('Payment', paymentSchema);

// ====================== RAZORPAY ======================
const razorpay = new Razorpay({
  key_id: 'rzp_test_THfhMRJtsqlVO1',
  key_secret: 'A68VJ6R6lnWwkmYQZU1O7Guu',
});

// ====================== EMAIL ======================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'itslacosmo@gmail.com',
    pass: 'jebbeh1wukkefibkUr',
  },
});

async function sendOrderEmails(payment) {
  try {
    // Notification to Store Owner
    await transporter.sendMail({
      from: '"LA COSMO Orders" <itslacosmo@gmail.com>',
      to: 'contact@lacosmo.in',
      subject: `New Paid Order - ₹${payment.amount}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #5C6B4A;">New Order Received</h2>
          <p><strong>Customer:</strong> ${payment.name}</p>
          <p><strong>Email:</strong> ${payment.email || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${payment.phone}</p>
          <p><strong>Address:</strong> ${payment.address}</p>
          <p><strong>Amount:</strong> ₹${payment.amount}</p>
          <p><strong>Payment ID:</strong> ${payment.paymentId || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color:green;">Paid</span></p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('en-IN')}</p>
        </div>
      `,
    });

    // Order Confirmation to Customer
    if (payment.email) {
      await transporter.sendMail({
        from: '"LA COSMO" <itslacosmo@gmail.com>',
        to: payment.email,
        subject: `Order Confirmation - LA COSMO (₹${payment.amount})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #5C6B4A;">Thank you for your order!</h2>
            <p>Hi ${payment.name},</p>
            <p>We have received your payment of <strong>₹${payment.amount}</strong>.</p>
            <p>Your order is being processed and will be shipped soon.</p>
            <br/>
            <p><strong>Delivery Address:</strong><br/>${payment.address}</p>
            <br/>
            <p>If you have any questions, reply to this email or WhatsApp us.</p>
            <p style="color:#5C6B4A; font-weight:600;">LA COSMO – Conscious Fashion</p>
          </div>
        `,
      });
    }

    console.log('Emails sent successfully');
  } catch (error) {
    console.error('Email error:', error.message);
  }
}

// ====================== ROUTES ======================

// Create Payment Link
app.post('/create-payment-link', async (req, res) => {
  try {
    const { amount, name, email, phone, address, items } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // 1. Create Razorpay Payment Link first
    const paymentLink = await razorpay.paymentLink.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      accept_partial: false,
      description: 'LA COSMO Order',
      customer: {
        name: name || 'Customer',
        email: email || '',
        contact: phone || '',
      },
      notify: {
        sms: true,
        email: !!email,
      },
      reminder_enable: true,
      notes: {
        address: address || '',
      },
    });

    // 2. Try to save to database (but don't fail the whole request if it fails)
    try {
      await Payment.create({
        paymentLinkId: paymentLink.id,
        status: 'created',
        amount,
        name,
        email,
        phone,
        address,
        items: items || [],
      });
      console.log('Order saved to database');
    } catch (dbError) {
      console.error('Database save failed (but payment link is created):', dbError.message);
    }

    // Always return success if Razorpay link is created
    res.json({
      success: true,
      payment_link: paymentLink.short_url,
      id: paymentLink.id,
    });

  } catch (error) {
    console.error('Create payment error:', error);
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
    console.log('Webhook:', event.event);

    if (event.event === 'payment_link.paid') {
      const paymentLinkId = event.payload?.payment_link?.entity?.id;
      const paymentId = event.payload?.payment?.entity?.id;

      if (paymentLinkId) {
        try {
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
            await sendOrderEmails(payment);
            console.log('Payment PAID + Emails sent');
          } else {
            console.log('Payment link not found in DB, but payment was successful');
          }
        } catch (err) {
          console.error('Webhook DB error:', err.message);
        }
      }
    }

    if (event.event === 'payment_link.expired') {
      const paymentLinkId = event.payload?.payment_link?.entity?.id;
      if (paymentLinkId) {
        try {
          await Payment.findOneAndUpdate(
            { paymentLinkId },
            { status: 'expired' }
          );
        } catch (err) {
          console.error('Expired update error:', err.message);
        }
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
  res.send('LA COSMO Backend is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
