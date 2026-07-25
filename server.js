const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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
      amount: amount * 100, // Convert to paise
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

app.get('/', (req, res) => {
  res.send('LA COSMO Backend is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
