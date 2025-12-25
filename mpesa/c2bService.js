// mpesa/c2bService.js
export class C2BService {
  constructor({ darajaClient, config }) {
    this.client = darajaClient;
    this.config = config;
  }

  async registerUrls() {
    return this.client.post("/mpesa/c2b/v1/registerurl", {
      ShortCode: this.config.shortcode,
      ResponseType: "Completed",
      ConfirmationURL: this.config.confirmationUrl,
      ValidationURL: this.config.validationUrl,
    });
  }
}
