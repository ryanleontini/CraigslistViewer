// Puppeteer is a headless browser.
import puppeteer from "puppeteer-core";
import os from "os";

let allListings = []; // Global array to hold all listings

import express from "express";
import cors from "cors";
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const interfaces = os.networkInterfaces();
const port = 3000;

app.use(cors());

app.use(express.static('/root/server/Website/carysgarage/build'));

let lastQueriedTime = null;

// Tracks failed GET requests.
let unavailabilityTracker = {
    name: 0,
    link: 0,
    price: 0,
    image: 0,
    odometer: 0,
    location: 0
};

function logMissingAttributes() {
    let hasMissingAttributes = false;  // A flag to determine if we have any missing attributes
    let missingSummary = "Summary of missing attributes:";

    for (let key in unavailabilityTracker) {
        if (unavailabilityTracker.hasOwnProperty(key) && unavailabilityTracker[key] > 0) {
            hasMissingAttributes = true;
            missingSummary += `\n${key.charAt(0).toUpperCase() + key.slice(1)}: ${unavailabilityTracker[key]} missing`;
        }
    }

    if (hasMissingAttributes) {
        console.log(missingSummary);
    } else {
        console.log("No missing attributes!");
    }
}

async function scrapeWebsite(browser, link, term) {
    let termListings = [];
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(2 * 60 * 1000);

    await page.goto(link);
    const searchTerm = term;

    const selector = '.cl-search-result'
    await page.waitForSelector(selector);
    const el = await page.$(selector);

    const text = await el.evaluate(e => e.innerHTML);

    const listings = await page.$$('li.cl-search-result');
    console.log(term);

    for (let i = 0; i < 5; i++) {
        let name, link, price, image, odometer, location;
    
        // Name
        try {
            name = await listings[i].$eval('div > a > span.label', el => el.innerText);
        } catch (error) {
            name = "Unavailable";
            unavailabilityTracker.name++;
        }
        // Link
        try {
            link = await listings[i].$eval('div > a', el => el.getAttribute('href'));
        } catch (error) {
            link = "Unavailable";
            unavailabilityTracker.link++;
        }
        // Price
        try {
            price = await listings[i].$eval('div > span.priceinfo', el => el.innerText);
        } catch (error) {
            price = "Unavailable";
            unavailabilityTracker.price++;
        }
        // Image
        try {
            image = await listings[i].$eval('.swipe-wrap > div > img', el => el.getAttribute('src'));
        } catch (error) {
            image = "Unavailable";
        }
        if (image == "Unavailable") {
            try {
                image = await listings[i].$eval('.gallery-inner > a > img', el => el.getAttribute('src'));
            } catch (error) {
                image = "Unavailable";
                unavailabilityTracker.image++;
            }
        }

        // Odometer
        try {
            let spans = await listings[i].$$eval('.attrgroup > span', spans => spans.map((span) => span.innerText));
            let odometerSpan = spans.find(span => span.includes('odometer'));
            if (odometerSpan) {
                odometer = odometerSpan.split(':')[1].trim();
            }
        } catch (error) {
            odometer = "Unavailable";
            unavailabilityTracker.odometer++;
        }
        // Location
        try {
            location = await listings[i].$eval('div > .meta > span.separator:nth-of-type(2)', el => el.nextSibling.nodeValue.trim());
        } catch (error) {
            location = "Unavailable";
        }
        if (location == "Unavailable") {
            try {
                location = await listings[i].$eval('div > .meta > span.separator:nth-of-type(1)', el => el.nextSibling.nodeValue.trim());
            } catch (error) {
                location = "Unavailable";
                unavailabilityTracker.location++;
            }  
        }

        // Create a JSON object for the listing
        const listing = {
            "Listing": i + 1,
            "Name": name,
            "Price": price,
            "Image": image,
            "Link": link,
            "Odometer": odometer,
            "Location": location,
        };

        termListings.push(listing);
    }
    const terms = {
        "Term": term,
        "Listings": termListings 
    }
    allListings.push(terms)

    logMissingAttributes();
}

function getIPAddresses() {
    const interfaces = os.networkInterfaces();
    const ipAddresses = [];
  
    for (let interfaceName in interfaces) {
      const addresses = interfaces[interfaceName];
  
      for (let addressInfo of addresses) {
        if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
          ipAddresses.push(addressInfo.address);
        }
      }
    }
  
    return ipAddresses;
  }

function queryTimeData() {

    const currentTime = new Date();
    console.log("Current time:", currentTime);

    if (lastQueriedTime) {
        const difference = currentTime - lastQueriedTime;
        const seconds = Math.floor(difference / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        console.log(`It has been ${hours} hours, ${minutes % 60} minutes, and ${seconds % 60} seconds since the last query.`);
    } else {
        console.log("This is the first time querying the data.");
    }

    lastQueriedTime = currentTime;
}

async function runTasks(browser) {

    queryTimeData();

    const truckLink = ('https://slo.craigslist.org/search/cta?query=truck#search=1~gallery~0~0');
    const signLink = ('https://slo.craigslist.org/search/sss?min_price=100&query=sign#search=1~gallery~0~0');
    const c10Link = ('https://slo.craigslist.org/search/sss?min_price=100&query=c10#search=1~gallery~0~0');
    const tractorLink = ('https://slo.craigslist.org/search/sss?min_price=100&query=tractor#search=1~gallery~0~0');

    const startTime = new Date().getTime();  // Record the start time

    // Add functionality that detects when new data is being fetched.
    try {
        await scrapeWebsite(browser, truckLink, 'TRUCKS');
        await scrapeWebsite(browser, signLink, 'SIGNS');
        await scrapeWebsite(browser, c10Link, "C10'S");
        await scrapeWebsite(browser, tractorLink, 'Tractors');
    } catch (e) {
        console.error("scrape failed", e);
    } finally {
        await browser.close();
    }

    const endTime = new Date().getTime();  // Record the end time
    const timeTaken = (endTime - startTime) / 1000;  // Calculate the time difference in seconds

    console.log(`Queries took ${timeTaken} seconds.`);

    console.log("Website data refreshed.");

    // Schedule the next run in a random minute between 30 and 60
    // const randomMinute = Math.floor(Math.random() * (60 - 30 + 1)) + 30;
    // setTimeout(() => runTasks(browser), randomMinute * 60 * 1000);

    // Run every 2 minutes
    setTimeout(() => runTasks(browser), 5 * 60 * 1000);

}

async function run() {
    // Browser itself
    let browser;

    // Try to connect to the browser.
    try {
        
        const ipAddresses = getIPAddresses();

        // Connecting to bright data
        const auth = 'brd-customer-hl_353b1f0e-zone-scraping_browser:th59k4ujxu0n'

        browser = await puppeteer.connect({
            // Browser websocket endpoint
            browserWSEndpoint: `wss://${auth}@brd.superproxy.io:9222`
        });

        runTasks(browser);

        app.get('/listings', (req, res) => {
            res.send(allListings);
            console.log("GET received.");
        });

        app.get('*', (req, res) => {
            res.sendFile(path.resolve('/root/server/Website/carysgarage/build', 'index.html'));
        });
          
        app.listen(port, '0.0.0.0', () => {
            console.log('Server IP addresses: ', ipAddresses.join(', '));
            console.log(`Server running at http://${ipAddresses}:${port}`);
        });



    } catch (e) {
        console.error('scrape failed in run', e);
    }
}

run()
