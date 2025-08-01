// --- FINAL INTELLIGENT VERSION ---
// --- This version detects URLs and uses premium scraping for difficult sites ---

async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY is not set.");
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    
    const prompt = `
    You are an expert, empathetic social media analyst and coach. Your goal is to analyze a user's text and provide a friendly, insightful, and actionable analysis. Do not be robotic or overly academic.

    **Step 1: Analyze the Text.**
    Based on the provided text, classify the user into one of these archetypes:
    - The Digital Observer: Mostly shares links or consumes content without much personal commentary.
    - The Community Weaver: Focuses on replies, congratulating others, and connecting people.
    - The Focused Advocate: Posts with strong opinions about specific topics to persuade or inform.
    - The Content Creator: Produces original content (stories, ideas, visuals) to build a personal brand or share expertise.

    **Step 2: Structure the Output.**
    You MUST return ONLY a valid JSON object. Do not include any other text or markdown. The JSON object must follow this exact structure:
    {
      "current_style": "A one-sentence, friendly summary of the user's archetype.",
      "what_this_looks_like": "Provide 1-2 concrete, relatable examples of posts this person might make.",
      "predicted_narrative": "In a story-like tone, describe the user's 6-month trajectory and what new archetype they are moving towards.",
      "why_this_shift_happens": "In an empathetic tone, explain the typical motivations or feelings behind this kind of change (e.g., 'This shift often comes from a growing confidence...').",
      "actionable_tip": "Provide one small, encouraging, and actionable piece of advice for the user related to their trajectory."
    }
    ---
    USER TEXT TO ANALYZE:
    ${text}
    ---
    `;

    const response = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) { const errorBody = await response.text(); throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`); }
    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
    if (!jsonMatch) { throw new Error("Could not parse JSON from Gemini response."); }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

export default async function handler(req, res) {
  try {
    const { text } = req.body;
    const trimmedText = text ? text.trim() : '';

    if (!trimmedText) {
        return res.status(400).json({ message: 'Text input cannot be empty.' });
    }

    let textToAnalyze = trimmedText;

    const containsSpaces = /\s/.test(trimmedText);
    const containsDot = trimmedText.includes('.');

    if (!containsSpaces && containsDot) {
        console.log(`Input detected as URL: ${trimmedText}. Scraping content...`);
        
        const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
        if (!SCRAPINGBEE_API_KEY) throw new Error("SERVER CONFIG ERROR: SCRAPINGBEE_API_KEY is not set.");

        const fullUrl = trimmedText.startsWith('http') ? trimmedText : `http://${trimmedText}`;

        // --- Changelog ---
        // Added 'premium_proxy: true' to handle difficult-to-scrape sites like LinkedIn.
        const params = new URLSearchParams({
            api_key: SCRAPINGBEE_API_KEY,
            url: fullUrl,
            extract_rules: '{"text":"body"}',
            premium_proxy: 'true' 
        });
        
        const scrapeResponse = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
        
        if (!scrapeResponse.ok) {
            const errorText = await scrapeResponse.text();
            throw new Error(`Scraping service failed (Status: ${scrapeResponse.status}). Response: ${errorText}`);
        }
        
        const scrapedData = await scrapeResponse.json();
        textToAnalyze = scrapedData.text; 
    }
    
    const analysisResult = await getGeminiAnalysis(textToAnalyze.substring(0, 15000));
    
    res.status(200).json(analysisResult);

  } catch (error) {
    console.error('[FATAL] User analysis failed:', error);
    res.status(500).json({ message: "An internal server error occurred during analysis.", debug_info: { message: error.message }});
  }
}
