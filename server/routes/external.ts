import { Router } from "express";

const router = Router();

// Helper function for RapidAPI requests
async function rapidApiRequest(url: string, host: string) {
  const apiKey = process.env.RAPIDAPI_KEY;
  
  if (!apiKey) {
    throw new Error('RAPIDAPI_KEY not configured');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Rapidapi-Key': apiKey,
      'X-Rapidapi-Host': host
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RapidAPI error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// YouTube video search endpoint
router.get("/youtube/search", async (req, res) => {
  try {
    const { q, hl = 'en', gl = 'US' } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Use YouTube autocomplete/search API
    const url = `https://youtube138.p.rapidapi.com/auto-complete/?q=${encodeURIComponent(q as string)}&hl=${hl}&gl=${gl}`;
    const data = await rapidApiRequest(url, 'youtube138.p.rapidapi.com');
    
    res.json(data);
  } catch (error) {
    console.error('YouTube search error:', error);
    res.status(500).json({ 
      error: "Failed to search YouTube videos",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// YouTube video search with results endpoint
router.get("/youtube/videos", async (req, res) => {
  try {
    const { q, hl = 'en', gl = 'US' } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Search for video reviews - append "review" to get review content
    const searchQuery = `${q} review`;
    const url = `https://youtube138.p.rapidapi.com/search/?q=${encodeURIComponent(searchQuery)}&hl=${hl}&gl=${gl}`;
    const data = await rapidApiRequest(url, 'youtube138.p.rapidapi.com');
    
    res.json(data);
  } catch (error) {
    console.error('YouTube video search error:', error);
    res.status(500).json({ 
      error: "Failed to fetch YouTube videos",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Movie ratings endpoint (requires IMDb ID)
router.get("/ratings/:imdbId", async (req, res) => {
  try {
    const { imdbId } = req.params;
    
    if (!imdbId || !imdbId.startsWith('tt')) {
      return res.status(400).json({ error: "Valid IMDb ID is required (format: tt1234567)" });
    }

    const url = `https://movies-ratings2.p.rapidapi.com/ratings?id=${imdbId}`;
    const data = await rapidApiRequest(url, 'movies-ratings2.p.rapidapi.com');
    
    res.json(data);
  } catch (error) {
    console.error('Ratings fetch error:', error);
    res.status(500).json({ 
      error: "Failed to fetch movie ratings",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// YouTube video streaming data endpoint
router.get("/youtube/streaming-data/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!videoId) {
      return res.status(400).json({ error: "Video ID is required" });
    }

    const url = `https://youtube138.p.rapidapi.com/video/streaming-data/?id=${videoId}`;
    const data = await rapidApiRequest(url, 'youtube138.p.rapidapi.com');
    
    res.json(data);
  } catch (error) {
    console.error('YouTube streaming data error:', error);
    res.status(500).json({ 
      error: "Failed to fetch streaming data",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
