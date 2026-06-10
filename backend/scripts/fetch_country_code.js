const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'vat_codes.json');

const COUNTRY_CODES = ['SG', 'PH', 'MY', 'ID', 'HK', 'GF'];
const BASE_URL = 'https://erp-integration-sprint.neoflo.ai/api/v1/sap/vat-codes';
const BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJpbnRlZ3JhdGlvbi1zZXJ2aWNlIiwiZXhwIjoxNzgxMDk0Njc2LCJpYXQiOjE3ODEwODc0NzZ9.wS4J33SSZ24987hwoAoAmIm4ACJPb12KrPKKJgRfFa0";
const TENANT_ID = '69f47995f1b86d9d5b266b6b';

function fetchVatCodes(countryCode) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      country_code: countryCode,
      sap_language: 'EN',
      sap_client: '300',
    });

    const url = new URL(`${BASE_URL}?${params.toString()}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'X-Tenant-Id': TENANT_ID,
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = parsed?.[0]?.d?.results ?? parsed?.d?.results ?? [];
          const cleaned = results.map(({ __metadata, ...rest }) => rest);
          resolve({ country: countryCode, status: res.statusCode, data: cleaned });
        } catch (e) {
          resolve({ country: countryCode, status: res.statusCode, error: 'Failed to parse response', raw: data });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ country: countryCode, status: null, error: e.message });
    });

    req.end();
  });
}

async function main() {
  if (!BEARER_TOKEN) {
    console.error('Error: Set BEARER_TOKEN env var before running.');
    process.exit(1);
  }

  console.error(`Fetching VAT codes for: ${COUNTRY_CODES.join(', ')}`);

  const results = await Promise.all(COUNTRY_CODES.map(fetchVatCodes));

  const output = {};
  for (const result of results) {
    if (result.error) {
      console.error(`[${result.country}] Error (HTTP ${result.status}): ${result.error}`);
      output[result.country] = { error: result.error };
    } else if (result.status !== 200) {
      console.error(`[${result.country}] Non-200 status: ${result.status}`);
      output[result.country] = { error: `HTTP ${result.status}`, raw: result.data };
    } else {
      console.error(`[${result.country}] OK`);
      output[result.country] = result.data;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.error(`Saved to ${OUTPUT_FILE}`);
}

main();