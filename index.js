
const https = require("https");
const http = require("http");
const cron = require('node-cron');
const axios = require("axios");
const cheerio = require('cheerio');

const PORT = process.env.PORT || 5001;
const SKUS_TO_CHECK = {
  2962862: 'GRVL 120 S',
};

function getConf() {
  if(process.env.CONF) {
      console.log('reading conf from env');
      console.log(process.env.CONF);
      return JSON.parse(process.env.CONF);
  } else {
      console.log('reading conf from file');
      const conf = require('./conf.json');
      return conf;
  }
}

const conf = getConf();
const skus = conf.skusToCheck || SKUS_TO_CHECK;
const alreadyNotifiedSkus = {};

function sendTelegramMessage(APIKey, recipient, message) {

  const data = JSON.stringify({
    "chat_id": recipient,
    "text": message
  });

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${APIKey}/sendMessage`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    console.log('Status Code:', res.statusCode);

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Body: ', JSON.parse(data));
    });

  }).on("error", (err) => {
      console.log("Error: ", err.message);
  });
  req.write(data);
  req.end();
}

async function isCanyonBikeAvailable(urlObject) {
  const { data: bikePage } = await axios.get(urlObject.url);
  const $ = cheerio.load(bikePage);
  const sizeClass = $(`[data-product-size=${urlObject.size}]`).attr("class");
  const outOfStock = sizeClass.includes("nonSelectableVariation");
  return !outOfStock;
}

async function checkCanyonStocks() {
  conf.canyonUrlsToCheck.map(async (urlObject) => {
    try {
      const isInStock = await isCanyonBikeAvailable(urlObject);
      if(isInStock){
        const msg = `Yay they have stock for bike ${urlObject.name}, ${urlObject.size}`;
        console.log(msg);
        sendTelegramMessage(conf.telegramAPIKey, conf.telegramRecipient, msg);
      } else {
        console.log(`No luck for bike ${urlObject.name}, ${urlObject.size}`)
      }
    } catch (error) {
      console.log(`Error fetching info for bike ${urlObject.name} at URL ${urlObject.url}`);
      console.log(error);
    }
  })
}

function getDecatStock() {
  https
  .request(
    {
      hostname: "www.decathlon.fr",
      path: `/fr/ajax/nfs/stocks/online?skuIds=${Object.keys(skus).join(',')}`,
    },
    res => {
      let data = "";

      res.on("data", d => {
        data += d;
      })
      res.on("end", () => {
        /**
         * data: {"availabilities":[],"total":0,"reason":"no_availabilities","message":"Diese Termine stehen zu einem späteren Zeitpunkt wieder für eine Online-Buchung zur Verfügung. ","number_future_vaccinations":79818}
         */
        const parsedData = JSON.parse(data);
        for (const sku in skus) {
          const stock = parsedData[sku].stockOnline;
          if(stock > 0) {
            const msg = `Yay they have stock for bike ${skus[sku]}, ${stock} remaining`;
            console.log(msg);
            if(!alreadyNotifiedSkus[sku]) {
              sendTelegramMessage(conf.telegramAPIKey, conf.telegramRecipient, msg);
              alreadyNotifiedSkus[sku] = true;
            } else {
              console.log('Sku already notified');
            }
          } else {
            const msg = `No luck for bike ${skus[sku]}`;
            console.log(msg);
            alreadyNotifiedSkus[sku] = false;
          }
        }
      })
    }
  )
  .end();
}

function checkAllStocks() {
  console.log(`Checking all stocks ${new Date()}`);
  getDecatStock();
  checkCanyonStocks();
}

cron.schedule('*/6 * * * *', checkAllStocks);
checkAllStocks();
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Kein Bike Hier\n');
}).listen(PORT, "0.0.0.0");
console.log(`Server running at http://127.0.0.1:${PORT}/`);