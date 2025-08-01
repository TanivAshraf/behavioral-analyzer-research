// --- FINAL CORRECTED VERSION ---

async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY is not set.");
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const prompt = `You are an expert, empathetic social media analyst... [Your full prompt goes here] ...`;
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
    if (!trimmedText) { return res.status(400).json({ message: 'Text input cannot be empty.' }); }

    let textToAnalyze = trimmedText;

    const containsSpaces = /\s/.test(trimmedText);
    const containsDot = trimmedText.includes('.');

    if (!containsSpaces && containsDot) {
        console.log(`Input detected as URL: ${trimmedText}. Scraping content...`);
        
        // --- Changelog ---
        // This file will now also correctly use the Vercel environment variable.
        const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
        if (!SCRAPINGBEE_API_KEY) throw new Error("SERVER CONFIG ERROR: SCRAPINGBEE_API_KEY is not set.");

        const fullUrl = trimmedText.startsWith('http') ? trimmedText : `http://${trimmedText}`;
        
        const params = new URLSearchParams({ api_key: SCRAPINGBEE_API_KEY, url: fullUrl, extract_rules: '{"text":"body"}', premium_proxy: 'true' });
        const scrapeResponse = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
        
        if (!scrapeResponse.ok) { const errorText = await scrapeResponse.text(); throw new Error(`Scraping service failed (Status: ${scrapeResponse.status}). Response: ${errorText}`); }
        
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
