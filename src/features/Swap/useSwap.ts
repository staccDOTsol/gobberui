import { TxVersion, solToWSol } from '@raydium-io/raydium-sdk-v2'
import { useAppStore, useTokenStore } from '@/store'
import { useSwapStore } from './useSwapStore'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { debounce } from '@/utils/functionMethods'
import Decimal from 'decimal.js'
import { ApiSwapV1OutSuccess, ApiSwapV1OutError } from './type'
import useTokenPrice from '@/hooks/token/useTokenPrice'

export default function useSwap(props: {
  shouldFetch?: boolean
  inputMint?: string
  outputMint?: string
  amount?: string
  refreshInterval?: number
  slippageBps?: number
  swapType: 'BaseIn' | 'BaseOut'
  validRoutes: any[]
}) {
  const {
    inputMint: propInputMint = '',
    outputMint: propOutputMint = '',
    amount: propsAmount,
    slippageBps: propsSlippage,
    swapType,
    validRoutes
  } = props || {}
  const [amount, setAmount] = useState('')
  const [inputMint, outputMint] = [
    propInputMint ? solToWSol(propInputMint).toBase58() : propInputMint,
    propOutputMint ? solToWSol(propOutputMint).toBase58() : propOutputMint
  ]

  const slippage = useSwapStore((s) => s.slippage)
  const slippageBps = new Decimal(propsSlippage || slippage * 10000).toFixed(0)
  const tokenPrices = useTokenPrice({mintList:[inputMint, outputMint]})
  const tokenMap = useTokenStore((s) => s.tokenMap)
  const [inputPrice, setInputPrice] = useState<number | null>(null)
  const [outputPrice, setOutputPrice] = useState<number | null>(null)

  useEffect(() => {
    if (tokenPrices.data && typeof tokenPrices.data === 'object' ) {
      setInputPrice(tokenPrices.data[inputMint]?.value || null)
      setOutputPrice(tokenPrices.data[outputMint]?.value || null)
    }
  }, [tokenPrices.data, inputMint, outputMint])

  const updateAmount = useCallback(
    debounce((val: string) => {
      setAmount(val)
    }, 200),
    []
  )

  useEffect(() => {
    updateAmount(propsAmount)
  }, [propsAmount, updateAmount])
  const computeSwap = useMemo(() => {
    if (!inputMint || !outputMint || !amount) {
      return null
    }

    const inputToken = tokenMap.get(inputMint)
    const outputToken = tokenMap.get(outputMint)
    if (!inputToken || !outputToken) return null

    if (!tokenPrices.data || typeof tokenPrices.data !== 'object') {
      return null
    }

    if (inputPrice === null || outputPrice === null) {
      return null
    }

    const exchangeRate =  inputPrice / outputPrice

    let inputAmount, outputAmount
    if (swapType === 'BaseIn') {
      inputAmount = new Decimal(amount)
      outputAmount = inputAmount.mul(exchangeRate)
    } else {
      outputAmount = new Decimal(amount)
      inputAmount = outputAmount.div(exchangeRate)
    }

    const priceImpactPct = 0.1  // Assume 0.1% for this example
    const fee = inputAmount.mul(0.003)  // Assume 0.3% fee

    const routePlan = validRoutes.map(route => ({
      inputMint: route.inputMint,
      outputMint: route.outputMint,
      feeRate: route.feeRate,
      poolId: route.poolId,
      feeMint: route.feeMint,
      feeAmount: route.feeAmount
    }))

    return {
      inputAmount: inputAmount.toFixed(inputToken.decimals),
      outputAmount: outputAmount.toFixed(outputToken.decimals),
      priceImpactPct,
      inputMint: inputToken,
      outputMint: outputToken,
      fee: fee.toFixed(inputToken.decimals),
      exchangeRate: exchangeRate.toString(),
      routes: validRoutes,
      swapType,
      otherAmountThreshold: swapType === 'BaseIn' 
        ? outputAmount.mul(1 - Number(slippageBps) / 10000).toFixed(outputToken.decimals)
        : inputAmount.mul(1 + Number(slippageBps) / 10000).toFixed(inputToken.decimals),
      routePlan
    }
  }, [inputMint, outputMint, amount, validRoutes, tokenMap, tokenPrices, swapType, inputPrice, outputPrice, slippageBps])
  return {
    response: computeSwap ? {
      id: Date.now().toString(),
      success: true,
      version: '1',
      ...computeSwap,
      msg: '',
      data: computeSwap
    } : null,
    ...computeSwap,
    data: computeSwap,
    error: null,
    openTime: Date.now(),
    isValidating: false,
    isLoading: false
  }
}
