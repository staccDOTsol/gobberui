import { BN } from '@coral-xyz/anchor'

export type BuyResult = {
  token_amount: BN
  sol_amount: BN
}

export type SellResult = {
  token_amount: BN
  sol_amount: BN
}

export class AMM {
  constructor(
    public virtualSolReserves: BN,
    public virtualTokenReserves: BN,
    public realSolReserves: BN,
    public realTokenReserves: BN,
    public initialVirtualTokenReserves: BN
  ) {}

  getBuyPrice(tokens: BN): BN {
    const productOfReserves = this.virtualSolReserves.mul(this.virtualTokenReserves)
    const newVirtualTokenReserves = this.virtualTokenReserves.sub(tokens)
    const newVirtualSolReserves = productOfReserves.div(newVirtualTokenReserves).add(new BN(1))
    const amountNeeded = newVirtualSolReserves.sub(this.virtualSolReserves)

    return amountNeeded
  }

  applyBuy(token_amount: BN): BuyResult {
    const final_token_amount = BN.min(token_amount, this.realTokenReserves)
    const sol_amount = this.getBuyPrice(final_token_amount)

    this.virtualTokenReserves = this.virtualTokenReserves.sub(final_token_amount)
    this.realTokenReserves = this.realTokenReserves.sub(final_token_amount)

    this.virtualSolReserves = this.virtualSolReserves.add(sol_amount)
    this.realSolReserves = this.realSolReserves.add(sol_amount)

    return {
      token_amount: final_token_amount,
      sol_amount: sol_amount
    }
  }

  applySell(token_amount: BN): SellResult {
    this.virtualTokenReserves = this.virtualTokenReserves.add(token_amount)
    this.realTokenReserves = this.realTokenReserves.add(token_amount)

    const sell_price = this.getSellPrice(token_amount)

    this.virtualSolReserves = this.virtualSolReserves.sub(sell_price)
    this.realSolReserves = this.realSolReserves.sub(sell_price)

    return {
      token_amount: token_amount,
      sol_amount: sell_price
    }
  }

  getSellPrice(tokens: BN): BN {
    const scaling_factor = this.initialVirtualTokenReserves
    const token_sell_proportion = tokens.mul(scaling_factor).div(this.virtualTokenReserves)
    const sol_received = this.virtualSolReserves.mul(token_sell_proportion).div(scaling_factor)
    return BN.min(sol_received, this.realSolReserves)
  }

  getBuyTokensForSol(sol_amount: BN): BN {
    try {
      console.log('sol_amount', sol_amount.toString())
      const soll = new BN(sol_amount.toString())
      const productOfReserves = this.virtualSolReserves.mul(this.virtualTokenReserves)
      const newVirtualSolReserves = this.virtualSolReserves.add(soll)
      const newVirtualTokenReserves = productOfReserves.div(newVirtualSolReserves)
      const tokensReceived = this.virtualTokenReserves.sub(newVirtualTokenReserves)
      return BN.min(tokensReceived, this.realTokenReserves)
    } catch (e) {
      return new BN(0)
    }
  }

  applyBuyWithSol(sol_amount: BN): BuyResult {
    const token_amount = this.getBuyTokensForSol(sol_amount)
    const final_sol_amount = this.getBuyPrice(token_amount)

    this.virtualTokenReserves = this.virtualTokenReserves.sub(token_amount)
    this.realTokenReserves = this.realTokenReserves.sub(token_amount)

    this.virtualSolReserves = this.virtualSolReserves.add(final_sol_amount)
    this.realSolReserves = this.realSolReserves.add(final_sol_amount)

    return {
      token_amount: token_amount,
      sol_amount: final_sol_amount
    }
  }

  getSellTokensForSol(sol_amount: BN): BN {
    const scaling_factor = this.initialVirtualTokenReserves
    const sol_sell_proportion = sol_amount.mul(scaling_factor).div(this.virtualSolReserves)
    const tokens_received = this.virtualTokenReserves.mul(sol_sell_proportion).div(scaling_factor)
    return tokens_received
  }

  applySellForSol(sol_amount: BN): SellResult {
    const token_amount = this.getSellTokensForSol(sol_amount)
    const final_sol_amount = BN.min(sol_amount, this.realSolReserves)

    this.virtualTokenReserves = this.virtualTokenReserves.add(token_amount)
    this.realTokenReserves = this.realTokenReserves.add(token_amount)

    this.virtualSolReserves = this.virtualSolReserves.sub(final_sol_amount)
    this.realSolReserves = this.realSolReserves.sub(final_sol_amount)

    return {
      token_amount: token_amount,
      sol_amount: final_sol_amount
    }
  }
}
