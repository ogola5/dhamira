// mpesa/darajaClient.js
import axios from "axios";

export class DarajaClient {
  constructor({ consumerKey, consumerSecret, baseUrl }) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = null;
    this.tokenExpiry = 0;
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiry) return this.token;

    const auth = Buffer.from(
      `${this.consumerKey}:${this.consumerSecret}`
    ).toString("base64");

    const res = await axios.get(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    this.token = res.data.access_token;
    this.tokenExpiry = now + (res.data.expires_in - 60) * 1000;

    return this.token;
  }

  async post(path, payload) {
    const token = await this.getAccessToken();
    return axios.post(`${this.baseUrl}${path}`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }
}
