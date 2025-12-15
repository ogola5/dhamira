// services/geminiService.js (Gemini Integration for Analysis)
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export const analyzeDefaultRisk = async (loanId) => {
  const loan = await LoanModel.findById(loanId).populate('repayments'); // Assume embed or populate
  const history = loan.repayments.map(rep => ({
    date: rep.createdAt,
    amount: rep.amount,
    onTime: rep.createdAt <= loan.dueDate, // Simple check
  }));

  const prompt = `
    Analyze this loan repayment history for default risk:
    Loan Amount: ${loan.amount} KES
    Due Date: ${loan.dueDate}
    Repayments: ${JSON.stringify(history)}
    
    Estimate probability of default (0-100%) and explain reasoning. Consider on-time payments, total paid vs due, patterns.
    Output JSON: { "defaultProbability": number, "reasoning": string, "riskLevel": "low|medium|high" }
  `;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text()); // Assume structured JSON output
};

export const analyzeSentiment = async (notes) => {
  const prompt = `
    Analyze this user feedback/notes for sentiment on service quality:
    Notes: ${notes}
    
    Score sentiment (0-100, 100=very positive) and suggest improvements if negative.
    Output JSON: { "sentimentScore": number, "summary": string, "suggestions": string[] }
  `;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
};