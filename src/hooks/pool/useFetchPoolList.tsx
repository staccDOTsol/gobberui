import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { KeyedMutator } from 'swr'
import axios, { AxiosResponse } from 'axios'
import { shallow } from 'zustand/shallow'
import { PoolsApiReturn, ApiV3PoolInfoItem, PoolFetchType, ApiV3PoolInfoStandardItem } from '@raydium-io/raydium-sdk-v2'
import { useAppStore, useTokenStore } from '@/store'
import { MINUTE_MILLISECONDS } from '@/utils/date'
import { isValidPublicKey } from '@/utils/publicKey'
import { ConditionalPoolType, FormattedPoolInfoStandardItem, ReturnFormattedPoolType, ReturnPoolType } from '@/hooks/pool/type'
import { formatAprData, formatPoolData } from './formatter'

export const retryCount = 5
export const skipRetryStatus = new Set([400, 403, 404, 500])
const logCount = 800

let refreshTag = Date.now()
export const refreshPoolCache = () => (refreshTag = Date.now())


const PAGE_SIZE = 100

const poolInfoCache: Record<string, any> = {}

export default async function useFetchPoolList<T extends PoolFetchType>(props?: {
  type?: T
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  refreshInterval?: number
  shouldFetch?: boolean
  showFarms?: boolean
  idList?: (string | undefined)[]
  readFromCache?: boolean
  keepPreviousData?: boolean
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
    showFarms,
    idList,
    readFromCache,
    keepPreviousData
  } = props || {}

  const readyIdList = idList?.filter((i) => i && isValidPublicKey(i) && !useTokenStore.getState().tokenMap.get(i)) as string[]

  if (type === undefined) {
    console.warn('Pool fetch type not specified, defaulting to PoolFetchType.All');
  }

  let data: any = []
  let isLoadEnded = false
  let error = null

    try {
      const url = 'http://localhost:3002/api/gpa'
      const params: any = {
        idList: readyIdList
      }

      const response = await axios.get<PoolsApiReturn>(`${url}?idList=${readyIdList ? readyIdList.join(',') : ''}`)
      // @ts-ignore
      data = await response.data
     
        isLoadEnded = true
    } catch (err) {
      error = err
      console.error('Error fetching pool list:', err)
    }
 // Move these calculations inside the component body
 let resData: ReturnPoolType<ApiV3PoolInfoStandardItem>[] = [];
 let dataMap: { [key: string]: ApiV3PoolInfoStandardItem } = {};
 let formattedData: FormattedPoolInfoStandardItem[] = [];
 let formattedDataMap: { [key: string]: FormattedPoolInfoStandardItem } = {};

 if (data) {
   resData = data.filter((d: any) => !!d).map(formatAprData);
   dataMap = resData.reduce((acc, cur) => ({ ...acc, [cur.id]: cur }), {});
   // @ts-ignore
   formattedData = resData.map(formatPoolData);
   formattedDataMap = formattedData.reduce((acc, cur) => ({ ...acc, [cur.id]: cur }), {});
 }
  // Return early if no data is fetched or if there's an error
  // Return early if no data is fetched or if there's an error
  if (!Object.values(data).length || error) {
    return {
      // @ts-ignore
      setSize: async () => {},
      loadMore: () => {},
      error,
      data: [],
      formattedData: [],
      isLoadEnded: true,
      isEmpty: true,
      size: 0,
      // @ts-ignore
      mutate: async () => {},
      isValidating: false,
      isLoading: false
    }
  }
  const setSize = async () => {}
  const loadMore = () => {}
  const isEmpty = isLoadEnded && (!data || !data.length)
console.log(data)
  return {
    // @ts-ignore
    setSize,
    loadMore,
    error,
    data: data,
    // @ts-ignore
    formattedData,
    isLoadEnded,
    isEmpty,
    size: 1,
    // @ts-ignore
    mutate: async () => {},
    isValidating: false,
    isLoading: !isLoadEnded
  }
}
// End of Selection