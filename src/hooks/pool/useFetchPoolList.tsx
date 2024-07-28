// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { KeyedMutator } from 'swr'
import { AxiosResponse } from 'axios'
import axios from '@/api/axios'
import shallow from 'zustand/shallow'
import { PoolsApiReturn, ApiV3PoolInfoItem, PoolFetchType, CpmmPoolInfoLayout, fetchMultipleMintInfos } from '@raydium-io/raydium-sdk-v2'
import { useAppStore } from '@/store'
import { MINUTE_MILLISECONDS } from '@/utils/date'
import { formatPoolData, formatAprData, poolInfoCache } from './formatter'
import { ReturnPoolType, ReturnFormattedPoolType } from './type'
import { Connection, PublicKey } from '@solana/web3.js'
import Decimal from 'decimal.js-light'

let refreshTag = Date.now()
export const refreshPoolCache = () => (refreshTag = Date.now())

const fetcher = ([url]: [url: string]) => axios.get<PoolsApiReturn>(url)

const PAGE_SIZE = 100
async function fetchProgramAccounts(connection: Connection, programId: string) {
  const accounts = await connection.getProgramAccounts(new PublicKey(programId),
  {
    encoding: "base64",
    filters:[
      {
        dataSize: 637
      }
  ]
  })
  return accounts.filter((account:any) => account.pubkey.toString() !== 'AJBTtXxDzoUtZrEPS7ZR5H18gYpLK4r9BH4AxCWD7v1y');
}

export default async function useFetchPoolList<T extends PoolFetchType>(props?: {
  type?: T
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  refreshInterval?: number
  shouldFetch?: boolean
  showFarms?: boolean
}): Promise<{
  data: ReturnPoolType<T>[]
  formattedData: ReturnFormattedPoolType<T>[]
  isLoadEnded: boolean
  setSize: (size: number | ((_size: number) => number)) => Promise<AxiosResponse<PoolsApiReturn, any>[] | undefined>
  size: number
  loadMore: () => void
  mutate: KeyedMutator<AxiosResponse<PoolsApiReturn, any>[]>
  isValidating: boolean
  isLoading: boolean
  isEmpty: boolean
  error?: any
}> {
  const {
    type = PoolFetchType.All,
    pageSize = PAGE_SIZE,
    sort = 'default',
    order = 'desc',
    refreshInterval = MINUTE_MILLISECONDS,
    shouldFetch = true,
    showFarms
  } = props || {}

    let data = [
    {
      data: {
        data: [],
        count: 0,
        hasNextPage: false
      }
    },

    {
      data: {
        data: [],
        count: 0,
        hasNextPage: false
      }
    }
  ]
  let isLoadEnded = false

  if (data) { 
    data[0].data.data = []
    data[0].data.count = 0
    data[0].data.hasNextPage = false
    console.log(data)
    if (data.length > 1){
    data[1].data.data = []
    data[1].data.count = 0
    data[1].data.hasNextPage = false
    }
    console.log(data)

    const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey='); // Use appropriate RPC endpoint
    const accounts = await fetchProgramAccounts(connection, '8yQvrjQuritLntxz6pAaWcEX6CsRMeDmr7baCLnNwEuw');
    console.log(accounts)
    for (const acc of accounts){
       const decodedData = CpmmPoolInfoLayout.decode(acc.account.data)
          const mintB = (await fetchMultipleMintInfos(
            {
            connection,
            mints:[decodedData.mintB]
            }
          ))[decodedData.mintB.toBase58()]
          const mintA = (await fetchMultipleMintInfos(
            {
            connection,
            mints:[decodedData.mintA]
            }
          ))[decodedData.mintA.toBase58()]
          const lpMint = (await fetchMultipleMintInfos(
            {
            connection,
            mints:[decodedData.mintLp]
            }
          ))[decodedData.mintLp.toBase58()]
          const poolData = {
            type: "Standard",
            programId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
            id: acc.pubkey.toString(),
            mintA: {
              
        "chainId": 101,
        "logoURI": "",
        "symbol": "",
        "name": "",
        "tags": [],
        "extensions": {},...mintA, programId: mintA.programId.toBase58(), address:decodedData.mintA.toBase58()},
        lpMint: {
          
    "chainId": 101,
    "logoURI": "",
    "symbol": "",
    "name": "",
    "tags": [],
    "extensions": {},...lpMint,programId: lpMint.programId.toBase58(), address:decodedData.mintLp.toBase58()},
            mintB: {
              
        "chainId": 101,
        "logoURI": "",
        "symbol": "",
        "name": "",
        "tags": [],
        "extensions": {},...mintB,programId: mintB.programId.toBase58(), address:decodedData.mintB.toBase58()},
            price: new Decimal(1).pow(2).toNumber(),
            mintAmountA: new Decimal((await connection.getTokenAccountBalance(decodedData.vaultA)).value.amount).div(new Decimal(10).pow(decodedData.mintDecimalA)).toNumber(),
            mintAmountB: new Decimal((await connection.getTokenAccountBalance(decodedData.vaultB)).value.amount).div(new Decimal(10).pow(decodedData.mintDecimalB)).toNumber(),
          
            
  /*{
    "type": "Standard",
    "programId": "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "id": "DFWtdd9k8VPFcC5DQjFniJnNcUqvSGm13C7aVKBZzxYh",
    "mintA": {
        "chainId": 101,
        "address": "So11111111111111111111111111111111111111112",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "logoURI": "https://img-v1.raydium.io/icon/So11111111111111111111111111111111111111112.png",
        "symbol": "WSOL",
        "name": "Wrapped SOL",
        "decimals": 9,
        "tags": [],
        "extensions": {}
    },
    "mintB": {
        "chainId": 101,
        "address": "CTJf74cTo3cw8acFP1YXF3QpsQUUBGBjh2k2e8xsZ6UL",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "logoURI": "https://img-v1.raydium.io/icon/CTJf74cTo3cw8acFP1YXF3QpsQUUBGBjh2k2e8xsZ6UL.png",
        "symbol": "Neiro",
        "name": "Neiro",
        "decimals": 6,
        "tags": [],
        "extensions": {}
    },
    "price": 2043.850598689151,
    "mintAmountA": 6326.603487369,
    "mintAmountB": 12930632.325328,
    "feeRate": 0.0025,
    "openTime": "0",
    "tvl": 2338502.55,
    "day": {
        "volume": 315483131.8427547,
        "volumeQuote": 11427290160.496674,
        "volumeFee": 788707.8296068838,
        "apr": 12310.37,
        "feeApr": 12310.37,
        "priceMin": 1403.822192872823,
        "priceMax": 3031743.18992,
        "rewardApr": []
    },
    "week": {
        "volume": 341421107.1899102,
        "volumeQuote": 12505067092.7243,
        "volumeFee": 853552.7679747725,
        "apr": 1095,
        "feeApr": 1095,
        "priceMin": 1403.822192872823,
        "priceMax": 3031743.18992,
        "rewardApr": []
    },
    "month": {
        "volume": 341421107.1899102,
        "volumeQuote": 12505067092.7243,
        "volumeFee": 853552.7679747725,
        "apr": 438,
        "feeApr": 438,
        "priceMin": 1403.822192872823,
        "priceMax": 3031743.18992,
        "rewardApr": []
    },
    "pooltype": [
        "OpenBookMarket"
    ],
    "rewardDefaultInfos": [],
    "farmUpcomingCount": 0,
    "farmOngoingCount": 0,
    "farmFinishedCount": 0,
    "marketId": "7ZyzJnbCCdK74j1sEi2FpoqZAM5rELPD4drAHFQxVCwx",
    "lpMint": {
        "chainId": 101,
        "address": "7qeX1G5GUoSSg5CGe6Mm1HVhbJcCKY7JUtcGiGaBzF6n",
        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "chainId": 101,
        "logoURI": "",
        "symbol": "",
        "name": "",
        "decimals": 9,
        "chainId": 101,
        "logoURI": "",
        "symbol": "",
        "name": "",
        "tags": [],
        "extensions": {}
    },
    "lpPrice": 569.4747783017777,
    "lpAmount": 4106.419887059
}*/
"lpPrice": 569.4747783017777,
"lpAmount": 4106.419887059,

"rewardDefaultInfos": [],
"farmUpcomingCount": 0,
"farmOngoingCount": 0,
"farmFinishedCount": 0,
"pooltype": [
],
"rewardDefaultPoolInfos":"Raydium",
"feeRate": 0.0025,
"openTime": "0",
"tvl": 2338502.55,
"day": {
    "volume": 315483131.8427547,
    "volumeQuote": 11427290160.496674,
    "volumeFee": 788707.8296068838,
    "apr": 12310.37,
    "feeApr": 12310.37,
    "priceMin": 1403.822192872823,
    "priceMax": 3031743.18992,
    "rewardApr": []
},
"week": {
    "volume": 341421107.1899102,
    "volumeQuote": 12505067092.7243,
    "volumeFee": 853552.7679747725,
    "apr": 1095,
    "feeApr": 1095,
    "priceMin": 1403.822192872823,
    "priceMax": 3031743.18992,
    "rewardApr": []
},
"month": {
    "volume": 341421107.1899102,
    "volumeQuote": 12505067092.7243,
    "volumeFee": 853552.7679747725,
    "apr": 438,
    "feeApr": 438,
    "priceMin": 1403.822192872823,
    "priceMax": 3031743.18992,
    "rewardApr": []
}
          }
          if (data.length > 1){
          // @ts-ignore
          data[1].data.data.push(poolData)
          data[1].data.count++
          console.log(poolData)
          }
        }
    isLoadEnded = true



  }
  function setSize(){};
  const issues = (data || [])
    .reduce((acc, cur) => acc.concat(cur.data.data), [] as ApiV3PoolInfoItem[])
    .filter(Boolean)
    .map(formatAprData) as ReturnPoolType<T>[]
  const formattedData = issues.map((i) => formatPoolData(i)) as ReturnFormattedPoolType<T>[]
  const loadMore = () => setSize((s) => s + 1)
  const isEmpty = isLoadEnded && (!data || !data.length)
  return {
    setSize,
    loadMore,
    error: null,
    data: issues,
    formattedData,
    isLoadEnded,
    isEmpty
  }
}
