import { NextApiRequest, NextApiResponse } from 'next';
import { InfluxDB } from '@influxdata/influxdb-client';
import { useState, useEffect, useCallback } from 'react';


const token =process.env.INFLUXDB_TOKEN || "r7f8CQBWFBrUjjfqz_NqOSVs4FFz0cWQ_qzQ_cMwYmCipaRFpRrgBasfFE53mZ045kRF7xs7bvFdPZcf9qKTYQ==";
const url = process.env.INFLUXDB_URL || "http://localhost:8086";
const org =  process.env.INFLUXDB_ORG || "myorg";
const bucket = 'solana_trades';
const metadataCache: { [key: string]: any } = {};

const influxDB = new InfluxDB({ url, token });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const fluxQuery = `
      from(bucket:"${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "trade")
        |> filter(fn: (r) => r._field == "buyPrice" or r._field == "sellPrice")
        |> group(columns: ["mint"])
        |> aggregateWindow(every: 1m, fn: last, createEmpty: false)
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 60, offset: 0)
      `;

      const queryApi = influxDB.getQueryApi(org);
      const result = await queryApi.collectRows(fluxQuery);
      console.log("Result: ", result);
      if (result.length === 0) {
        return res.status(404).json({ error: 'No data found' });
      }

      const marketOverview = await processMarketData(result);

      res.status(200).json(marketOverview);
    } catch (error:any) {
      console.error('Error fetching market overview:', error);
      res.status(500).json({ error: 'Failed to fetch market overview', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function processMarketData(data: any[]) {
  const entitiesMap = new Map();

  for (const trade of data) {
    const { mint, _time, _value, _field } = trade;
    const mintAddress = mint as string;
    const fetchTokenMetadata = async () => {
        if (!mintAddress) return;
      
        // Check if metadata is in cache
        if (metadataCache[mintAddress as string]) {
          return(metadataCache[mintAddress as string]);
        }
      
        const url = `https://mainnet.helius-rpc.com/?api-key=0d4b4fd6-c2fc-4f55-b615-a23bab1ffc85`;
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'my-id',
              method: 'getAsset',
              params: {
                id: mintAddress,
              },
            }),
          });
      
          const { result } = await response.json();
          console.log("Asset Data: ", result.content.metadata);
          
          if (result) {
            const metadata = {
              name: result.content.metadata.name,
              symbol: result.content.metadata.symbol,
              description: result.content.metadata.description,
              image: result.content.links.image,
              decimals: result.token_info.decimals,
              supply: result.token_info.supply,
            };
            
            // Store in cache
            metadataCache[mintAddress as string] = metadata;
            
            return(metadata);
          } else {
            console.log('No asset metadata found');
          }
        } catch (error) {
          console.error('Error fetching asset:', error);
        }
    }
    if (!entitiesMap.has(mint)) {
      entitiesMap.set(mint, {
        metadata: await fetchTokenMetadata(),
        mint,
        lastUpdated: new Date(_time),
        candles: [],
      });
    }

    const entity = entitiesMap.get(mint);
    const timestamp = new Date(_time).getTime();

    // Create a new candle for each data point (minutely candles)
    const newCandle = {
      timestamp: Math.floor(timestamp / 60000) * 60000,
      open: _value,
      high: _value,
      low: _value,
      close: _value,
      volume: 1
    };

    entity.candles.push(newCandle);

    if (_field === 'buyPrice' || _field === 'sellPrice') {
      entity[_field] = _value;
    }
  }

  const marketOverview = Array.from(entitiesMap.values())
    .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
    .map(entity => {
      // Calculate statistics and Greeks
      const lastPrice = entity.candles[entity.candles.length - 1].close;
      const returns = entity.candles.map((candle: any, index: any, array: any) => 
        index > 0 ? Math.log(candle.close / array[index - 1].close) : 0
      );
      const volatility = calculateVolatility(returns);
      const greeks = calculateGreeks(lastPrice, lastPrice, 1, 0.01, volatility);

      return {
        ...entity,
        lastPrice,
        volatility,
        ...greeks
      };
    });

  return marketOverview;
}

function calculateVolatility(returns: number[]): number {
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const squaredDifferences = returns.map(value => Math.pow(value - mean, 2));
  const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365 * 24 * 60); // Annualized volatility
}

function getTimeframeMillis(timeframe: string): number {
  switch (timeframe) {
    case '1s':
      return 1000;
    case '1m':
      return 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '15m':
      return 15 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000; // Default to 1 minute
  }
}

function getRange(timeframe: string): string {
  switch (timeframe) {
    case '1s':
      return '1h';
    case '1':
    case '1m':
      return '1d';
    case '5':
      return '5d';
    case '15':
      return '15d';
    case '1h':
      return '1h';
    case '4h':
      return '4h';
    case '1d':
      return '1d';
    default:
      return '1h';
  }
}
import { erf } from 'mathjs';

export function calculateGreeks(S: number, K: number, T: number, r: number, sigma: number) {
  const d1 = (Math.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const delta = normalCDF(d1);
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  const theta = (-S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2);
  const vega = S * Math.sqrt(T) * normalPDF(d1);
  const rho = K * T * Math.exp(-r * T) * normalCDF(d2);

  return { delta, gamma, theta, vega, rho };
}

function normalCDF(x: number): number {
  return (1 + erf(x / Math.sqrt(2))) / 2;
}

function normalPDF(x: number): number {
  return Math.exp(-Math.pow(x, 2) / 2) / Math.sqrt(2 * Math.PI);
}