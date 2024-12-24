const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const fs = require('fs');

// Load JSON key dynamically
const keyPath = '/home/nayefftouni/racetan/puppeteer-scraper/rapid-domain-445419-k1-afb12b954979.json'; // Replace with your JSON key file path
let keys;
try {
  keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} catch (error) {
  console.error('Error reading JSON key file:', error.message);
  process.exit(1);
}

// Google Sheet configurations
const spreadsheetId = '13-st8B7uL-nh_HePmMa6sJbuxkLY0eheEowisVBqQvw'; // Replace with your Sheet ID
const sheetName = 'Links Withrawal'; // Replace with your sheet name

async function scrapeUrl(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('span.text-150.text-success-d3.opacity-2', { timeout: 5000 });

    const scrapedText = await page.evaluate(() => {
      const element = document.querySelector('span.text-150.text-success-d3.opacity-2');
      return element ? element.textContent.trim() : null;
    });

    await browser.close();
    return scrapedText || 'No data found';
  } catch (error) {
    console.error(`Error scraping URL ${url}:`, error.message);
    await browser.close();
    return `Error: ${error.message}`;
  }
}

async function getSheetData(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const range = `${sheetName}!C:E`; // Read from column C (URLs) and column E (status)

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return result.data.values || [];
  } catch (error) {
    console.error('Error fetching sheet data:', error.message);
    return [];
  }
}

async function updateSheet(auth, rowIndex, scrapedData) {
  const sheets = google.sheets({ version: 'v4', auth });
  const range = `${sheetName}!E${rowIndex}`; // Update column E with scraped data

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[scrapedData]],
      },
    });
    console.log(`Updated row ${rowIndex} with:`, scrapedData);
  } catch (error) {
    console.error('Error updating sheet:', error.message);
  }
}

async function monitorSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials: keys,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();

  while (true) {
    try {
      const rows = await getSheetData(authClient);
      for (let i = 1; i < rows.length; i++) { // Skip header row
        const [,, url, , status] = rows[i]; // Column C is index 2, Column E is index 4
        if (url && !status) { // If URL exists and status (column E) is empty
          console.log(`Scraping URL: ${url}`);
          const scrapedData = await scrapeUrl(url);
          await updateSheet(authClient, i + 1, scrapedData); // Update the sheet
        }
      }
    } catch (error) {
      console.error('Error during monitoring:', error.message);
    }
    console.log('Waiting for the next check...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute before checking again
  }
}

monitorSheet();
