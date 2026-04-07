const axios = require('axios');
const cheerio = require('cheerio');

const ZILLOW_BASE = 'https://www.zillow.com';

const scrapeZillow = async (city, state, filters = {}) => {
  try {
    const location = `${city}-${state}`.toLowerCase().replace(/ /g, '-');
    const url = `${ZILLOW_BASE}/${location}/`;
    
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    const listings = [];
    
    // Note: Zillow heavily blocks scraping - this may need proxy/bypass
    $('.search-results-list').find('article').each((i, el) => {
      if (i >= 20) return;
      
      const price = $(el).find('.price').text().replace(/[^0-9]/g, '');
      const address = $(el).find('.address').text().trim();
      
      if (price) {
        listings.push({
          source: 'zillow.com',
          price: parseInt(price) || 0,
          address,
          scrapedAt: new Date().toISOString()
        });
      }
    });
    
    return listings;
  } catch (error) {
    console.error('Zillow scrape error:', error.message);
    return [];
  }
};

module.exports = { scrapeZillow };
