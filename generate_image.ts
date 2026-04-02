import { GoogleGenAI } from "@google/genai";

async function generateColorImage() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: 'A solid, uniform square of deep crimson color, hex code #800E21. No gradients, no textures, just a flat solid color block.',
        },
      ],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      console.log('IMAGE_DATA:' + part.inlineData.data);
    }
  }
}

generateColorImage();
