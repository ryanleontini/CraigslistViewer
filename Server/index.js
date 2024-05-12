// Puppeteer is a headless browser.
import puppeteer from "puppeteer-core";
import os from "os";
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import dotenv from 'dotenv'; // Import dotenv
dotenv.config(); // Activate dotenv configuration

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
const port = process.env.PORT || 3000;

app.use(cors());

app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`)
    } else {
      next();
    }
  });  

// Checks if path to React app is valid.
function checkDirectoryMiddleware(directoryPath) {
    return function(req, res, next) {
        fs.access(directoryPath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error(`Directory not found: ${directoryPath}`);
                res.status(500).send('Internal Server Error: Required directory not found');
            } else {
                next();
            }
        });
    };
}

const directoryPath = path.join(__dirname, '..', 'carysgarage', 'build');
app.use(checkDirectoryMiddleware(directoryPath));
app.use(express.static(directoryPath));

app.use(express.static(path.join(__dirname, '..', 'carysgarage', 'build')));

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
  });

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
    try {
        let numberOfListings = 5;
        let termListings = [];
        const page = await browser.newPage();

        // If you want to only load the images. Need to find ways to not load 2mb of the craigslist page each time.
        // await page.setRequestInterception(true);
        // page.on('request', (request) => {
        //   if (request.resourceType() === 'image') {
        //     request.continue();
        //   } else {
        //     request.abort();
        //   }
        // });

        page.setDefaultNavigationTimeout(2 * 60 * 1000);

        const searchTerm = "Tractor";
        await page.goto(link);
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
              let totalHeight = 0;
              const distance = 100;
              const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
          
                if (totalHeight >= scrollHeight){
                  clearInterval(timer);
                  resolve();
                }
              }, 100);
            });
          });
          

        const imageUrls = await page.evaluate(() => {
            const images = document.querySelectorAll('img:nth-of-type(-n+3)');
            return Array.from(images).slice(0, 5).map(img => img.src);
          });
        console.log("Here are the image URLs.")
        console.log(imageUrls);          

        const selector = 'li.cl-search-result'
        await page.waitForSelector(selector);
        const el = await page.$(selector);

        const text = await el.evaluate(e => e.innerHTML);

        const listings = await page.$$(selector);

        for (let i = 0; i < numberOfListings; i++) {
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
                image = imageUrls[i];
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

            console.log(listing);

            termListings.push(listing);
        }
        const terms = {
            "Term": term,
            "Listings": termListings 
        }
        allListings.push(terms)

        logMissingAttributes();
    } catch (error) {
        console.error('Error in scrapeWebsite', error);
    }
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

function formatCurrentTimePacific() {
    const now = new Date();

    const options = {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        year: '2-digit',
        month: '2-digit',
        day: '2-digit'
    };

    const formattedTime = now.toLocaleString('en-US', options);

    // Example formattedTime: "09/25/23, 7:18 PM"
    // If you need to remove the comma, you can use the following:
    return formattedTime.replace(',', ''); 
}  
  
function queryTimeData() {

    const currentTime = new Date();
    console.log("Current time:", formatCurrentTimePacific());

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
    try {

        queryTimeData();
        // const tractor4x4Link = ('https://slo.craigslist.org/search/sss?query=tractor%204x4%20loader#search=1~gallery~0~0');
        const tractor4x4Link = ('https://slo.craigslist.org/search/sss?query=tractor%204x4%20loader#search=1~gallery~0~0');
        const tiltTrailerLink = ('https://slo.craigslist.org/search/sss?query=tilt%20trailer#search=1~gallery~0~0');
        const forkliftLink = ('https://slo.craigslist.org/search/sss?purveyor=owner&query=forklift#search=1~gallery~0~0');
        const truckPatinaLink = ('https://slo.craigslist.org/search/sss?purveyor=owner&query=truck%20patina#search=1~gallery~0~0');
        const signLink = ('https://slo.craigslist.org/search/sss?min_price=100&query=sign#search=1~gallery~0~0');
        const shortbedC10Link = ('https://slo.craigslist.org/search/sss?purveyor=owner&query=shortbed%20c10#search=1~gallery~0~0');
        // const c10Link = ('https://slo.craigslist.org/search/sss?min_price=100&query=c10#search=1~gallery~0~0');
        // const tractorLink = ('https://slo.craigslist.org/search/sss?min_price=100&query=tractor#search=1~gallery~0~0');

        const startTime = new Date().getTime();  // Record the start time

        // Add functionality that detects when new data is being fetched.

        await scrapeWebsite(browser, tractor4x4Link, 'Tractor 4x4 Loader');
        await scrapeWebsite(browser, tiltTrailerLink, 'Tilt Trailer');
        await scrapeWebsite(browser, forkliftLink, 'Forklift');
        await scrapeWebsite(browser, truckPatinaLink, 'Truck Patina');
        await scrapeWebsite(browser, shortbedC10Link, 'Shortbed C10');
        await scrapeWebsite(browser, signLink, 'Signs');

        const endTime = new Date().getTime();  // Record the end time

        fs.writeFile('lastRunTime.txt', endTime.toString(), (err) => {
            if (err) {
                console.error('Error writing to file', err);
            } else {
                console.log('Last run time saved');
            }
        });

        const timeTaken = (endTime - startTime) / 1000;  // Calculate the time difference in seconds

        const now = new Date();

        console.log(`Queries took ${timeTaken} seconds.`);

        console.log("Website data refreshed.");

        // // Run every 60 minutes?
        setTimeout(() => runTasks(browser), 60 * 60 * 1000);

    } catch (e) {
        console.error("Run Tasks failed", e);
    } finally {
        await browser.close();
    }

}

async function readLastRunTime() {
    try {
        // Read the content of the file
        const data = await fsPromises.readFile('lastRunTime.txt', 'utf8');
        return data;
    } catch (err) {
        console.error('Error reading from file', err);
        // Handle the error (e.g., return a default value or throw an error)
        throw err; // or return a default value like 'Unavailable'
    }
}

async function run() {
    // Browser itself
    let browser;

    // Try to connect to the browser.
    try {
        
        // const ipAddresses = getIPAddresses();

        // Connecting to bright data
        const auth = process.env.BRD_AUTH

        browser = await puppeteer.connect({
            // Browser websocket endpoint
            browserWSEndpoint: `wss://${auth}@brd.superproxy.io:9222`
        });

        runTasks(browser);

        app.get('/listings', (req, res) => {
            res.send(allListings);
            console.log("GET received.");
        });

        app.get('/lastRunTime', async (req, res) => {
            const lastRunTime = await readLastRunTime(); // Function to get the last run time from a file or database
            res.json({ lastRunTime });
        });        

        app.get('*', (req, res) => {
            app.use(express.static(path.join(__dirname, '..', 'carysgarage', 'build', 'index.html')));
        });
          
        app.listen(port, () => {
            // console.log('Server IP addresses: ', ipAddresses.join(', '));
            console.log(`Server is running on port ${port}`);
        });

    } catch (e) {
        console.error('scrape failed in run', e);
    }
}

run()
