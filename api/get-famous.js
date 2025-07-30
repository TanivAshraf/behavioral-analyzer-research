// Forcing a fresh build to reload all environment variables.
// --- File: api/get-famous.js ---
// --- This is the FINAL version that uses ScrapingBee ---

// The getGeminiAnalysis function does not need to change.
async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY environment variable is not set.");
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;
    
    // Your full prompt goes here
    const prompt = `You are a computational social scientist... [Your full prompt goes here] ...`;

    const response = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) { const errorBody = await response.text(); throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`); }
    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
    if (!jsonMatch) { throw new Error("Could not parse JSON from Gemini response."); }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

// The main handler for this serverless function
export default async function handler(req, res) {
    const { url, name } = req.query;
    // We are now using the ScrapingBee key
    const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

    try {
        if (!url || !name) {
            return res.status(400).json({ error: 'URL and name parameters are required.' });
        }
        // Checking for the new key
        if (!SCRAPINGBEE_API_KEY) {
            throw new Error("SERVER CONFIG ERROR: SCRAPINGBEE_API_KEY environment variable is not set.");
        }
        
        // Constructing the request for the ScrapingBee API
        const params = new URLSearchParams({
            api_key: SCRAPINGBEE_API_KEY,
            url: url,
            extract_rules: '{"text":"body"}', // Instructs ScrapingBee to get all text from the page body
        });
        
        const scrapeResponse = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
        
        if (!scrapeResponse.ok) {
            const errorText = await scrapeResponse.text();
            throw new Error(`Scraping service failed (Status: ${scrapeResponse.status}). Response: ${errorText}`);
        }
        
        const scrapedData = await scrapeResponse.json();
        const scrapedText = scrapedData.text; // The text content is inside a 'text' property
        
        const analysis = await getGeminiAnalysis(scrapedText.substring(0, 15000));

        res.status(200).json({ name, analysis });

    } catch (error) {
        console.error(`[FATAL] Processing ${name} failed:`, error);
        res.status(500).json({ 
            name, 
            error: "An internal server error occurred.",
            debug_info: { message: error.message, name: error.name }
        });
    }
}
