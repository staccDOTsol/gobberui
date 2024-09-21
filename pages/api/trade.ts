import { NextApiRequest, NextApiResponse } from 'next'
import { InfluxDB, Point } from '@influxdata/influxdb-client'
import { AMM } from '../../utils/amm'
import { Connection, PublicKey } from '@solana/web3.js'

const token = process.env.INFLUXDB_TOKEN || "myinfluxdbtoken";
const url = "http://localhost:8086";
const org = "myorg";
const bucket = 'solana_trades'

const influxDB = new InfluxDB({ url, token })
const connection = new Connection(process.env.GEYSER_ENDPOINT || "https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW")

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { timestamp, mint } = req.body
      const bondingCurve = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()], new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"))
      const accountData = (await connection.getAccountInfo((bondingCurve[0])))?.data
      const bondingCurveData = accountData?.slice(8)

      if (!bondingCurveData) {
        throw new Error('Failed to fetch bonding curve data')
      }

      const virtualSolReserves = bondingCurveData.readBigUInt64LE(0)
      const virtualTokenReserves = bondingCurveData.readBigUInt64LE(8)
      const realSolReserves = bondingCurveData.readBigUInt64LE(16)
      const realTokenReserves = bondingCurveData.readBigUInt64LE(24)
      const tokenTotalSupply = bondingCurveData.readBigUInt64LE(32)
      const complete = bondingCurveData.readUInt8(40) !== 0

      const amm = new AMM(
        virtualSolReserves,
        virtualTokenReserves,
        realSolReserves,
        realTokenReserves,
        BigInt(1000000000000000)
      )

      const buyPrice = Number((amm.getBuyPrice(BigInt(1_000_000) * BigInt(10)**BigInt(9))) / BigInt(10)**BigInt(9))
      const sellPrice = Number((amm.getSellPrice(BigInt(1_000_000) * BigInt(10)**BigInt(9))) / BigInt(10)**BigInt(9))

      const writeApi = influxDB.getWriteApi(org, bucket)
      const point = new Point('trade')
        .tag('mint', mint)
        .floatField('virtualSolReserves', Number(virtualSolReserves))
        .floatField('virtualTokenReserves', Number(virtualTokenReserves))
        .floatField('realSolReserves', Number(realSolReserves))
        .floatField('realTokenReserves', Number(realTokenReserves))
        .floatField('tokenTotalSupply', Number(tokenTotalSupply))
        .booleanField('complete', complete)
        .floatField('buyPrice', buyPrice)
        .floatField('sellPrice', sellPrice)
        .timestamp(new Date(timestamp))

      writeApi.writePoint(point)
      await writeApi.close()

      res.status(200).json({ message: 'Trade data recorded successfully' })
    } catch (error) {
      console.error('Error recording trade data:', error)
      res.status(500).json({ error: 'Failed to record trade data' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}