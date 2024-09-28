import { AccountInfo, Connection, PublicKey } from '@solana/web3.js'

export async function fetchProgramAccounts(connection: Connection, programId: string, options: any) {
  try {
    const accounts = await connection.getProgramAccounts(new PublicKey(programId), options)
    console.log(accounts)
    // @ts-ignore
    return accounts.map((account) => ({
      pubkey: account.pubkey,
      account: account.account
    }))
  } catch (e) {
    console.error('Error fetching program accounts:', e)
    return []
  }
}
export type BuyResult = {
  token_amount: bigint
  sol_amount: bigint
}

export type SellResult = {
  token_amount: bigint
  sol_amount: bigint
}

export class AMM {
  constructor(
    public virtualSolReserves: bigint,
    public virtualTokenReserves: bigint,
    public realSolReserves: bigint,
    public realTokenReserves: bigint,
    public initialVirtualTokenReserves: bigint
  ) {}

  getBuyPrice(tokens: bigint): bigint {
    const productOfReserves = this.virtualSolReserves * this.virtualTokenReserves
    const newVirtualTokenReserves = this.virtualTokenReserves - tokens
    const newVirtualSolReserves = productOfReserves / newVirtualTokenReserves + BigInt(1)
    const amountNeeded = newVirtualSolReserves - this.virtualSolReserves

    return amountNeeded
  }

  applyBuy(token_amount: bigint): BuyResult {
    const final_token_amount = token_amount > this.realTokenReserves ? this.realTokenReserves : token_amount
    const sol_amount = this.getBuyPrice(final_token_amount)

    this.virtualTokenReserves = this.virtualTokenReserves - final_token_amount
    this.realTokenReserves = this.realTokenReserves - final_token_amount

    this.virtualSolReserves = this.virtualSolReserves + sol_amount
    this.realSolReserves = this.realSolReserves + sol_amount

    return {
      token_amount: final_token_amount,
      sol_amount: sol_amount
    }
  }

  applySell(token_amount: bigint): SellResult {
    this.virtualTokenReserves = this.virtualTokenReserves + token_amount
    this.realTokenReserves = this.realTokenReserves + token_amount

    const sell_price = this.getSellPrice(token_amount)

    this.virtualSolReserves = this.virtualSolReserves - sell_price
    this.realSolReserves = this.realSolReserves - sell_price

    return {
      token_amount: token_amount,
      sol_amount: sell_price
    }
  }

  getSellPrice(tokens: bigint): bigint {
    const scaling_factor = this.initialVirtualTokenReserves
    const token_sell_proportion = (tokens * scaling_factor) / this.virtualTokenReserves
    const sol_received = (this.virtualSolReserves * token_sell_proportion) / scaling_factor
    return sol_received < this.realSolReserves ? sol_received : this.realSolReserves
  }
}
export default async function handler(req: any, res: any) {
  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01HRZ9G6Z2A19FY8PR4RF4J4PW')
  const programIds = ['65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9', 'Ei1CgRq6SMB8wQScEKeRMGYkyb3YmRTaej1hpHcqAV9r']
  for (const programId of programIds) {
    const accounts = await fetchProgramAccounts(connection, programId, {
      encoding: 'base64',
      filters: [
        {
          dataSize: 49
        }
      ]
    })
    const amms: AMM[] = []
    for (const account of accounts) {
      const data = Buffer.from(account.account.data).slice(8, 8 + 16 + 16 + 16 + 16)
      const virtualSolReserves = data.readBigUInt64LE(0)
      const virtualTokenReserves = data.readBigUInt64LE(16)
      const realSolReserves = data.readBigUInt64LE(32)
      const realTokenReserves = data.readBigUInt64LE(48)
      const initialVirtualTokenReserves = data.readBigUInt64LE(64)
      const amm = new AMM(virtualSolReserves, virtualTokenReserves, realSolReserves, realTokenReserves, initialVirtualTokenReserves)
      amms.push(amm)
      console.log(amm.getBuyPrice(BigInt(1000000)))
    }
    res.json(amms)
  }
}
