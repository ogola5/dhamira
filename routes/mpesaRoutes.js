import express from 'express';
import { mpesaB2CResultCallback } from '../controllers/mpesaB2CController.js';
import { mpesaC2BCallback } from '../controllers/mpesaC2BController.js';

const router = express.Router();

/**
 * ============================
 * SAFARICOM CALLBACKS (PUBLIC)
 * ============================
 */

// B2C disbursement result
router.post('/b2c/result', mpesaB2CResultCallback);

// C2B payment confirmation
router.post('/c2b/confirmation', mpesaC2BCallback);

// Optional validation endpoint (recommended)
router.post('/c2b/validation', (req, res) => {
  return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

export default router;
