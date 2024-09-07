import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { AccountInfo, PublicKey } from '@solana/web3.js'
import {   ApiV3Token } from '@raydium-io/raydium-sdk-v2'

import useFetchPoolById from '../pool/useFetchPoolById'

import { useTokenAccountStore } from '@/store'
import useTokenPrice from '@/hooks/token/useTokenPrice'
import { getTickArrayAddress } from '@/hooks/pool/formatter'
import useFetchMultipleAccountInfo from '@/hooks/info/useFetchMultipleAccountInfo'
import { useClmmStore, useAppStore } from '@/store'
import { useEvent } from '../useEvent'
import { debounce } from '@/utils/functionMethods'
import Decimal from 'decimal.js'

interface RewardInfo {
  mint: ApiV3Token
  amount: string
  amountUSD: string
}
export interface UpdateClmmPendingYield {
  nftMint: string
  pendingYield: Decimal
  isEmpty: boolean
  rewardInfo: RewardInfo[]
}

export type PositionWithUpdateFn = any & {
  updateClmmPendingYield: (data: UpdateClmmPendingYield) => void
  tickLowerRpcData?: AccountInfo<Buffer> | null
  tickUpperRpcData?: AccountInfo<Buffer> | null
}
export type ClmmDataWithUpdateFn = Map<string, PositionWithUpdateFn[]>

export type PositionTabValues = 'concentrated' | 'standard' | 'staked RAY'

export default function useAllPositionInfo({ shouldFetch = true }: { shouldFetch?: boolean }) {
  const harvestAllClmmAct = useClmmStore((s) => s.harvestAllAct)
  const owner = useAppStore((s) => s.publicKey)
  const fetchTokenAccountAct = useTokenAccountStore((s) => s.fetchTokenAccountAct)

  const [isSending, setIsSending] = useState(false)
  const [allClmmPending, setAllClmmPending] = useState(new Decimal(0))

  const clmmPendingYield = useRef<
    Map<
      string,
      {
        usd: Decimal
        isEmpty: boolean
        rewardInfo: RewardInfo[]
      }
    >
  >(new Map())

  const {
    data: clmmPoolAssets = [],
    clmmBalanceInfo = new Map(),
    isLoading: isClmmBalanceLoading = false,
    slot: clmmPositionSlot = 0
  } = {}

  const {
    // @ts-ignore
    data: clmmData = [],
    // @ts-ignore
    dataMap: clmmDataMap = {},
    // @ts-ignore
    isLoading: isPoolLoading = false,
    // @ts-ignore
    mutate: mutatePoolInfo = () => {}
  } = useFetchPoolById<any>({
    idList: Array.from(clmmBalanceInfo.entries()).map((r) => r[0])
  })

  const clmmRecord: { [key: string]: any[] } = Array.from(clmmBalanceInfo.entries()).reduce(
    (acc, cur) => ({
      ...acc,
      [cur[0]]: cur[1]
    }),
    {}
  )

  const readyList = clmmData.length
    ? Array.from(clmmBalanceInfo.entries()).map(([poolId, positions]) => {
        return positions.map((position: any) => {
          const pool = clmmDataMap[poolId]
          if (!pool) return null
          return [
            getTickArrayAddress({ pool, tickNumber: position.tickLower }),
            getTickArrayAddress({ pool, tickNumber: position.tickUpper })
          ]
        })
      })
    : []
  const {
    dataWithId: clmmTickAddressData,
    mutate: mutateClmmTicks,
    slot: tickSlot
  } = useFetchMultipleAccountInfo({
    name: 'get clmm position tick',
    publicKeyList: readyList.flat().flat() as PublicKey[],
    refreshInterval: 60 * 1000 * 10
  })

  const skipUpdate = useRef(false)
  skipUpdate.current = tickSlot < clmmPositionSlot

  const refreshClmmTicks = useEvent(
    debounce(() => {
      if (!skipUpdate.current) return
      mutateClmmTicks()
    }, 1500)
  )

  useEffect(() => {
    if (tickSlot !== 0 && clmmPositionSlot !== 0 && clmmPositionSlot > tickSlot) refreshClmmTicks()
  }, [tickSlot, clmmPositionSlot, refreshClmmTicks])

  const clmmRewardInfo = new Map<string, RewardInfo>()
  Array.from(clmmPendingYield.current.values())
    .filter((d) => !d.isEmpty)
    .forEach((data) => {
      data.rewardInfo.forEach((reward) => {
        if (clmmRewardInfo.has(reward.mint.address)) {
          const prevReward = clmmRewardInfo.get(reward.mint.address)!
          clmmRewardInfo.set(reward.mint.address, {
            mint: reward.mint,
            amount: new Decimal(prevReward.amount).add(reward.amount).toFixed(reward.mint.decimals),
            amountUSD: new Decimal(prevReward.amountUSD).add(reward.amountUSD).toFixed(10)
          })
          return
        }
        clmmRewardInfo.set(reward.mint.address, {
          mint: reward.mint,
          amount: reward.amount,
          amountUSD: reward.amountUSD
        })
      })
    })

  const rewardState: Record<
    PositionTabValues,
    {
      isReady: boolean
      pendingReward: string
      rewardInfo: RewardInfo[]
    }
  > = {
    concentrated: {
      isReady: allClmmPending.gt(0) || Array.from(clmmPendingYield.current.values()).some((d) => !d.isEmpty),
      pendingReward: allClmmPending.toFixed(10),
      rewardInfo: Array.from(clmmRewardInfo.values())
    },
    'staked RAY': {
      isReady: false,
      pendingReward: "0",
      rewardInfo: []
    },
    standard: {
      isReady: false,
      pendingReward: "0",
      rewardInfo: []
    }
  }

  const isLoading = false || isClmmBalanceLoading || isPoolLoading

  const handleRefresh = useEvent(() => {
    fetchTokenAccountAct({})
    mutatePoolInfo()
    useTokenAccountStore.setState({ refreshClmmPositionTag: Date.now() })
  })

  const handleHarvest = useEvent(async ({ tab, zeroClmmPos }: { tab: PositionTabValues; zeroClmmPos?: Set<string> }) => {
    setIsSending(true)

    const handleRefreshFarm = () => {
    }

    const handleRefreshClmm = () => {
      setTimeout(() => {
        mutatePoolInfo()
        useTokenAccountStore.setState({ refreshClmmPositionTag: Date.now() })
      }, 2000)
    }

    if (tab === 'standard' && rewardState.standard.isReady && [].length) {
  
    }

    if (tab === 'staked RAY' && rewardState['staked RAY'].isReady && [].length) {
     
    }

    if (tab === 'concentrated' && rewardState.concentrated.isReady) {
      const noneZeroPos = { ...clmmRecord }
      Object.keys(noneZeroPos).forEach((key) => {
        const readyList = noneZeroPos[key].filter((p) => (zeroClmmPos ? !zeroClmmPos.has(p.nftMint.toBase58()) : true))
        if (!readyList.length) {
          delete noneZeroPos[key]
          return
        }
        noneZeroPos[key] = readyList
      })
      await harvestAllClmmAct({
        allPoolInfo: clmmData.reduce(
          (acc:any, cur:any) =>
            cur?.id
              ? {
                  ...acc,
                  [cur.id]: cur
                }
              : acc,
          {}
        ),
        allPositions: noneZeroPos,
        execute: true,
        onConfirmed: handleRefreshClmm
      })
    }
    setIsSending(false)
  })

  const setTotalClmmPending = useCallback(
    debounce(
      () => setAllClmmPending(Array.from(clmmPendingYield.current.values()).reduce((acc, cur) => acc.add(cur.usd), new Decimal(0))),
      400
    ),
    []
  )

  const updateClmmPendingYield = useCallback(
    ({ nftMint, pendingYield, isEmpty, rewardInfo }: UpdateClmmPendingYield) => {
      if (skipUpdate.current && !isEmpty) return
      clmmPendingYield.current.set(nftMint, { usd: pendingYield, isEmpty, rewardInfo })
      setTotalClmmPending()
    },
    [setTotalClmmPending]
  )

  const balanceInfoWithUpdate = useMemo(
    () =>
      new Map(
        Array.from(clmmBalanceInfo.entries()).map(([key, balanceInfo]) => {
          const pool = clmmDataMap[key]
          return [
            key,
            balanceInfo.map((b:any) => ({
              ...b,
              tickLowerRpcData: pool ? clmmTickAddressData[getTickArrayAddress({ pool, tickNumber: b.tickLower }).toBase58()] : undefined,
              tickUpperRpcData: pool ? clmmTickAddressData[getTickArrayAddress({ pool, tickNumber: b.tickUpper }).toBase58()] : undefined,
              updateClmmPendingYield
            }))
          ]
        })
      ),
    [clmmBalanceInfo, clmmTickAddressData]
  )

  useEffect(
    () => () => {
      setAllClmmPending(new Decimal(0))
      clmmPendingYield.current.clear()
    },
    [owner?.toBase58()]
  )

  return {
    isLoading,
    isSending,
    rewardState,

    isFarmLoading: false,
    stakedFarmList: [],
    stakedFarmMap:  {},
    allFarmBalances: {},
    rpcFarmDataList:  [],
    farmLpBasedData:  {},

    isClmmLoading: isClmmBalanceLoading || isPoolLoading,
    clmmRecord,
    clmmPoolAssets,
    clmmBalanceInfo: balanceInfoWithUpdate,
    clmmPoolInfo: clmmData.reduce(
      (acc: any, cur: any) =>
        cur?.id
          ? {
              ...acc,
              [cur.id]: cur
            }
          : acc,
      {}
    ),
    clmmTickAddressData,
    updateClmmPendingYield,

    totalPendingYield: allClmmPending.add(0),
    allClmmPending,
    allFarmPendingReward:0,

    handleHarvest,
    handleRefresh
  }
}
