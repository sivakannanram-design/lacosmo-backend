// Webhook endpoint with better error handling
app.post('/webhook', (req, res) => {
  try {
    const secret = 'lacosmo_secret_2026';
    const signature = req.headers['x-razorpay-signature'];

    // 1. Check if signature exists
    if (!signature) {
      console.error('Webhook Error: Missing signature');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // 2. Verify signature
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(req.body);
    const digest = shasum.digest('hex');

    if (digest !== signature) {
      console.error('Webhook Error: Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // 3. Parse event safely
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (parseError) {
      console.error('Webhook Error: Failed to parse JSON', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('Webhook received:', event.event);

    // 4. Handle different events
    if (event.event === 'payment_link.paid') {
      try {
        const paymentLinkId = event.payload?.payment_link?.entity?.id;
        const paymentId = event.payload?.payment?.entity?.id;

        if (!paymentLinkId) {
          console.error('Webhook Error: payment_link id missing');
          return res.status(400).json({ error: 'Invalid payload structure' });
        }

        if (payments[paymentLinkId]) {
          payments[paymentLinkId].status = 'paid';
          payments[paymentLinkId].paymentId = paymentId || null;
          payments[paymentLinkId].paidAt = new Date();
          console.log('Payment marked as PAID:', paymentLinkId);
        } else {
          console.warn('Payment link not found in memory:', paymentLinkId);
          // Still return 200 so Razorpay doesn't retry endlessly
        }
      } catch (err) {
        console.error('Error processing payment_link.paid:', err);
      }
    }

    if (event.event === 'payment_link.expired') {
      try {
        const paymentLinkId = event.payload?.payment_link?.entity?.id;
        if (paymentLinkId && payments[paymentLinkId]) {
          payments[paymentLinkId].status = 'expired';
          console.log('Payment link expired:', paymentLinkId);
        }
      } catch (err) {
        console.error('Error processing payment_link.expired:', err);
      }
    }

    // Always respond quickly to Razorpay
    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Unexpected Webhook Error:', error);
    // Still return 200 to avoid Razorpay retrying too many times
    res.status(200).json({ status: 'error_logged' });
  }
});
