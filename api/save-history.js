import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { analysis } = req.body;

    if (!analysis || !analysis.current_archetype) {
      return res.status(400).json({ message: 'Invalid analysis object provided.' });
    }

    const entryId = `analysis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await kv.set(entryId, analysis);
    
    res.status(200).json({ message: 'Analysis saved successfully', id: entryId });

  // Changelog: Added console.error for server-side logging.
  } catch (error) {
    console.error('[FATAL] KV Store Error:', error);
    res.status(500).json({ message: 'Failed to save analysis.' });
  }
}
