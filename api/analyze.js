// --- FINAL CORRECTED VERSION ---

// This import is not strictly needed for this file's logic, but it's good practice.
import { kv } from '@vercel/kv';

async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY is not set.");
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const prompt = `You are an expert, empathetic social media analyst... [Your full prompt from our previous discussion goes here] ...`;

    const response = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) { const errorBody = await response.text(); throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`); }
    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
    if (!jsonMatch) { throw new Error("Could not parse JSON from Gemini response."); }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

// --- Changelog ---
// Fixed a critical typo. The first parameter was ".req" and has been corrected to "req".
export default async function handler(req, res) {
  try {
    const { text } = req.body;
    if (!text || text.trim() === '') {
        return res.status(400).json({ message: 'Text input cannot be empty.' });
    }
    const analysisResult = await getGeminiAnalysis(text);

    if (analysisResult.error) {
        return res.status(400).json({ message: analysisResult.error });
    }
    
    res.status(200).json(analysisResult);

  } catch (error) {
    console.error('[FATAL] User analysis failed:', error);
    res.status(500).json({ message: "An internal server error occurred during analysis.", debug_info: { message: error.message }});
  }
}
