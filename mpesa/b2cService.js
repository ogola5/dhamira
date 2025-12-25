// mpesa/b2cService.js
import { makeIdempotencyKey, normalizeMsisdn } from './mpesaUtils.js';
import Transaction from '../models/TransactionModel.js';

export class B2CService {
  constructor({ darajaClient, config }) {
    this.client = darajaClient;
    this.config = config;
  }

  /**
   * Initiate loan disbursement via M-Pesa B2C
   * This does NOT touch ledger or loan state.
   */
  async disburseLoan({ loanId, phone, amount_cents, initiatedBy }) {
    const msisdn = normalizeMsisdn(phone);

    const idempotencyKey = makeIdempotencyKey(
      'mpesa_b2c',
      loanId,
      amount_cents,
      msisdn
    );

    // 1. Create or fetch transaction (idempotent)
    const tx = await Transaction.findOneAndUpdate(
      { type: 'mpesa_b2c', idempotencyKey },
      {
        $setOnInsert: {
          type: 'mpesa_b2c',
          direction: 'OUT',
          amount_cents,
          status: 'pending',
          loanId,
          phone: msisdn,
          idempotencyKey,
          initiatedBy,
        },
      },
      { upsert: true, new: true }
    );

    // If already sent, do nothing
    if (tx.status !== 'pending') {
      return tx;
    }

    // 2. Send request to Safaricom
    const payload = {
      InitiatorName: this.config.initiatorName,
      SecurityCredential: this.config.securityCredential,
      CommandID: 'BusinessPayment',
      Amount: Math.round(amount_cents / 100),
      PartyA: this.config.shortcode,
      PartyB: msisdn,
      Remarks: `Loan disbursement ${loanId}`,
      QueueTimeOutURL: this.config.timeoutUrl,
      ResultURL: this.config.resultUrl,
      Occasion: String(loanId),
    };

    const res = await this.client.post(
      '/mpesa/b2c/v1/paymentrequest',
      payload
    );

    // 3. Save Safaricom reference for callback matching
    tx.checkoutRequestId = res.data.OriginatorConversationID;
    await tx.save();

    return tx;
  }
}
