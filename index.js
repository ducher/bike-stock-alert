
const https = require("https");
const http = require("http");
const cron = require('node-cron');

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

function getBikeStock() {
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
            const msg = `No luck for bike ${skus[sku]} on ${new Date()}`;
            console.log(msg);
            alreadyNotifiedSkus[sku] = false;
          }
        }
      })
    }
  )
  .end();
}

cron.schedule('*/6 * * * *', getBikeStock);
getBikeStock();
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Kein Bike Hier\n');
}).listen(PORT, "0.0.0.0");
console.log(`Server running at http://127.0.0.1:${PORT}/`);