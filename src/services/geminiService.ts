import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  async suggestAuctionDetails(itemTitle: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a high-converting auction description and suggested starting price for: "${itemTitle}". Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            suggestedMinBid: { type: Type.NUMBER },
          },
          required: ["description", "suggestedMinBid"]
        }
      }
    });
    return JSON.parse(response.text);
  },

  async getBiddingStrategy(auctionTitle: string, currentBid: number, userCredits: number, bidHistory: any[]) {
    const historyStr = bidHistory.map(b => `${b.bidderName}: $${b.amount}`).join(", ");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert auction strategist. Auction: "${auctionTitle}". Current Bid: $${currentBid}. User Credits: $${userCredits}. Recent Bids: [${historyStr}]. Suggest a strategic next bid and a brief reasoning. Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedBid: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
          },
          required: ["suggestedBid", "reasoning"]
        }
      }
    });
    return JSON.parse(response.text);
  }
};
