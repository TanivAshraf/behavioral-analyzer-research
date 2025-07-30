// A reusable function for the Gemini analysis logic
async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("GEMINI_API_KEY is not set.");
    
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;
    
    // The prompt is the same as before
    const prompt = `You are a computational social scientist... [Your full prompt from the previous step goes here] ... USER TEXT TO ANALYZE:\n${text}\n---`;

    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API Error: ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text.trim());
}

// The main handler for this serverless function
export default async function handler(req, res) {
    const { url, name } = req.query;
    const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

    if (!url || !name) {
        return res.status(400).json({ error: 'URL and name parameters are required.' });
    }
    if (!BROWSERLESS_API_KEY) {
        return res.status(500).json({ error: 'Scraping service is not configured.', name });
    }
    
    try {
        // Step 1: Scrape the text content from the URL using Browserless
        const scrapeResponse = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, waitFor: 2000 }) // Wait for the page to load
        });
        
        if (!scrapeResponse.ok) {
            throw new Error(`Failed to scrape URL. Status: ${scrapeResponse.statusText}`);
        }
        
        const scrapedText = await scrapeResponse.text();
        
        // Step 2: Analyze the scraped text using our reusable Gemini function
        const analysis = await getGeminiAnalysis(scrapedText.substring(0, 15000)); // Limit text to avoid exceeding token limits

        res.status(200).json({ name, analysis });

    } catch (error) {
        console.error(`Error processing ${name}:`, error);
        res.status(500).json({ name, error: error.message });
    }
}
