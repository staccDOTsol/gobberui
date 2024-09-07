import { useMemo } from 'react'
import { RAYMint, ApiV3Token } from '@raydium-io/raydium-sdk-v2'

import { useTokenAccountStore, useTokenStore } from '@/store'
import useFetchAccLpMint from '@/hooks/token/useFetchAccLpMint'
import useTokenPrice from '@/hooks/token/useTokenPrice'

import Decimal from 'decimal.js'

export default function useAllStandardPoolPosition<T>({ type }: { type?: T }) {
  const getTokenBalanceUiAmount = useTokenAccountStore((s) => s.getTokenBalanceUiAmount)
  const tokenPriceRecord = useTokenStore((s) => s.tokenPriceRecord)


  const { data: lpMintList, lpPoolInfo: poolList } = useFetchAccLpMint({ fetchLpPoolInfo: true })

  lpMintList.forEach((lpMintData) => {
    const lpMint = lpMintData.address.toString()
    const balance = getTokenBalanceUiAmount({
      mint: lpMint,
      decimals: poolList.find((p) => p.lpMint.address === lpMint)?.lpMint.decimals || 6
    })
    if (balance.isZero) return

  })

  const idleLpMintList = useMemo(
    () =>
      lpMintList
        .filter((lpMint) => {
          const pool = poolList.find((p) => p.lpMint.address === lpMint.address.toString())
          return (
            pool &&
            pool.farmOngoingCount > 0 &&
            !getTokenBalanceUiAmount({
              mint: pool.lpMint.address,
              decimals: pool.lpMint.decimals
            }).isZero
          )
        })
        .map((lpMint) => {
          const pool = poolList.find((p) => p.lpMint.address === lpMint.address.toString())!
          const balance = getTokenBalanceUiAmount({
            mint: pool.lpMint.address,
            decimals: pool.lpMint.decimals
          })

          return {
            token: pool.lpMint,
            address: pool.lpMint.address.toString(),
            isZero: balance.isZero,
            amount: balance.text,
            amountInUSD: new Decimal(balance.text).mul(pool.lpPrice || 0).toString()
          }
        }),
    [lpMintList, poolList, getTokenBalanceUiAmount]
  )

  return {
    totalUSD: 0,
    data: [],
    standardPoolListByMint: {},
    idleLpMintList
  }
}
