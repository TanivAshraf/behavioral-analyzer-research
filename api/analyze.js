// This file can reuse the same getGeminiAnalysis function if we structure our project differently.
// For simplicity, we are duplicating the function here.

async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY environment variable is not set.");
    }
    
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;
    
    // IMPORTANT: Make sure your full prompt is pasted here
    const prompt = `
    You are a computational social scientist. Your task is to analyze a user's social media text based on the "Online Engagement Matrix" and established behavioral archetypes.

    // ... (Your full, detailed prompt from our previous discussion goes here) ...

    ---
    USER TEXT TO ANALYZE:
    ${text}
    ---
  `;

    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
     if (!jsonMatch) {
      throw new Error("Could not parse JSON from Gemini response.");
    }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { text } = req.body;
    if (!text || text.trim() === '') {
        return res.status(400).json({ message: 'Text input cannot be empty.' });
    }
    
    const analysisResult = await getGeminiAnalysis(text);
    res.status(200).json(analysisResult);

  // Changelog: Improved catch block for better debugging.
  } catch (error) {
    console.error('[FATAL] User analysis failed:', error);
    res.status(500).json({ 
        message: "An internal server error occurred during analysis.",
        debug_info: {
            message: error.message,
            name: error.name
        }
    });
  }
}
