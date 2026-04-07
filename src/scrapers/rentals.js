const axios = require('axios');
const cheerio = require('cheerio');

const RENTALS_BASE = 'https://www.rentals.com';

const scrapeRentals = async (city, state, filters = {}) => {
  try {
    const location = `${city}-${state}`.toLowerCase().replace(/ /g, '-');
    const url = `${RENTALS_BASE}/${location}/`;
    
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    const listings = [];
    
    $('.listing-card').each((i, el) => {
      if (i >= 20) return; // Limit results
      
      const price = $(el).find('.price').text().replace(/[^0-9]/g, '');
      const address = $(el).find('.address').text().trim();
      const beds = $(el).find('.beds').text().trim();
      const baths = $(el).find('.baths').text().trim();
      
      if (price) {
        listings.push({
          source: 'rentals.com',
          price: parseInt(price) || 0,
          address,
          beds: beds || null,
          baths: baths || null,
          scrapedAt: new Date().toISOString()
        });
      }
    });
    
    return listings;
  } catch (error) {
    console.error('Rentals.com scrape error:', error.message);
    return [];
  }
};

module.exports = { scrapeRentals };
