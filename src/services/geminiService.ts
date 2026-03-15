import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export async function transcribeAudio(fileData: string, mimeType: string): Promise<TranscriptSegment[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Transcribe the following audio. Identify different speakers and label them as 'Speaker 1', 'Speaker 2', etc. 
    For each segment, provide the start time (in seconds), end time (in seconds), speaker label, and the text. 
    Return the result as a JSON array of objects with the following keys: 'start' (number), 'end' (number), 'speaker' (string), 'text' (string).
    Be extremely precise with timestamps.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: fileData,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER },
            speaker: { type: Type.STRING },
            text: { type: Type.STRING },
          },
          required: ["start", "end", "speaker", "text"],
        },
      },
    },
  });

  try {
    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response:", e);
    return [];
  }
}
