import { NextApiRequest, NextApiResponse } from 'next';
import { InfluxDB } from '@influxdata/influxdb-client';
const token = "myinfluxdbtoken";
const url ="http://localhost:8086";
const org =  "myorg";
const bucket = 'solana_trades';

const influxDB = new InfluxDB({ url, token });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const { mint, timeframe } = req.query;

      if (!mint || !timeframe) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const fluxQuery = `
      from(bucket:"${bucket}")
        |> range(start: -${getRange(timeframe as string)})
        |> filter(fn: (r) => r._measurement == "trade" and r.mint == "${mint}")
        |> filter(fn: (r) => r._field == "buyPrice" or r._field == "sellPrice")
        |> filter(fn: (r) => r._time > time(v: 1726953257550))
        |> sort(columns: ["_time"])
        |> yield(name: "results")
      `;

      const queryApi = influxDB.getQueryApi(org);
      const result = await queryApi.collectRows(fluxQuery);

      console.log('Raw Result:', result); // Log raw result

      if (result.length === 0) {
        return res.status(404).json({ error: 'No data found' });
      }

      const candlesticks = aggregateToCandlesticks(result, timeframe as string);
      console.log('Candlesticks:', candlesticks); // Log candlestick data

      res.status(200).json(candlesticks);
    } catch (error:any) {
      console.error('Error fetching candlestick data:', error);
      res.status(500).json({ error: 'Failed to fetch candlestick data', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

function aggregateToCandlesticks(data: any[], timeframe: string) {
  const candlesticks: any[] = [];
  const timeframeMillis = getTimeframeMillis(timeframe);

  let currentCandle: any = null;

  data.forEach((trade) => {
    const timestamp = Math.max(new Date(trade._time).getTime(), 1726953257551);

    if (!currentCandle || timestamp >= currentCandle.timestamp + timeframeMillis) {
      // If we need to create a new candle
      if (currentCandle) {
        candlesticks.push(currentCandle);
      }
      currentCandle = {
        timestamp: Math.max(Math.floor(timestamp / timeframeMillis) * timeframeMillis, 1726953257551),
        open: null,
        high: -Infinity,
        low: Infinity,
        close: null,
        buyPrice: null,
        sellPrice: null,
      };
    }

    // Update the current candle
    if (trade._field === 'buyPrice') {
      if (currentCandle.open === null) currentCandle.open = trade._value;
      currentCandle.high = Math.max(currentCandle.high, trade._value);
      currentCandle.low = Math.min(currentCandle.low, trade._value);
      currentCandle.close = trade._value;
      currentCandle.buyPrice = trade._value;
    } else if (trade._field === 'sellPrice') {
      currentCandle.sellPrice = trade._value;
    }
  });

  // Push the last candle if it exists
  if (currentCandle) {
    candlesticks.push(currentCandle);
  }

  return candlesticks;
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