import { ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Grid, GridItem, HStack, Text, TooltipProps, VStack } from '@chakra-ui/react'
import { ApiV3PoolInfoStandardItem, ApiV3Token, TokenInfo, CREATE_CPMM_POOL_PROGRAM, PoolFetchType } from '@raydium-io/raydium-sdk-v2'
import Decimal from 'decimal.js'

import Tabs, { TabItem } from '@/components/Tabs'
import useFetchPoolById from '@/hooks/pool/useFetchPoolById'
import { useEvent } from '@/hooks/useEvent'
import ChevronLeftIcon from '@/icons/misc/ChevronLeftIcon'
import { useTokenAccountStore } from '@/store/useTokenAccountStore'
import { panelCard } from '@/theme/cssBlocks'
import { colors } from '@/theme/cssVariables'
import { routeBack, setUrlQuery, useRouteQuery } from '@/utils/routeTools'
import { wsolToSolToken } from '@/utils/token'
import useFetchRpcPoolData from '@/hooks/pool/amm/useFetchRpcPoolData'
import useFetchCpmmRpcPoolData from '@/hooks/pool/amm/useFetchCpmmRpcPoolData'
import { LiquidityActionModeType, LiquidityTabOptionType, tabValueModeMapping } from '../utils'
import AddLiquidity from './Add'
import Stake from './Stake'
import PoolInfo from './components/PoolInfo'
import PositionBalance from './components/PositionBalance'
import StakeableHint from './components/StakeableHint'
import useFetchPoolList from '@/hooks/pool/useFetchPoolList'

export type IncreaseLiquidityPageQuery = {
  pool_id?: string
  action?: string
  mode?: LiquidityActionModeType
}

export type IncreaseTabOptionType = {
  value: 'Add Liquidity' | 'Stake Liquidity'
  label: ReactNode
  disabled?: boolean
  tooltipProps?: Omit<TooltipProps, 'children'>
}

export default function Increase() {
  const { pool_id: urlPoolId, mode: urlMode } = useRouteQuery<IncreaseLiquidityPageQuery>()
  const { t } = useTranslation()

  const increaseTabOptions: IncreaseTabOptionType[] = [
    { value: 'Add Liquidity', label: t('liquidity.add_liquidity') },
    { value: 'Stake Liquidity', label: t('liquidity.stake_liquidity') }
  ]
  const getTokenBalanceUiAmount = useTokenAccountStore((s) => s.getTokenBalanceUiAmount)
  const fetchTokenAccountAct = useTokenAccountStore((s) => s.fetchTokenAccountAct)
  const { lpBasedData } = { lpBasedData: null }

  const [tokenPair, setTokenPair] = useState<{ base?: ApiV3Token; quote?: ApiV3Token }>({})
const  [orgData, setOrgData] = useState<any>()
const  [orgLoadMore, setOrgLoadMore] = useState<any>()
const [  isOrgLoadedEnd, setIsOrgLoadedEnd]= useState<any>()
const [ isOrgLoading, setIsOrgLoading]  = useState<any>()

const [pool, setPool ] = useState<any>()

  const toawaot =  useFetchPoolById({shouldFetch: true, idList: [urlPoolId]});
  useEffect(() => {
    const fetchPools = async () => {
      const pools = await toawaot;
      console.log(pools)
      if (pools && pools.formattedData && pools.formattedData.length > 0) {
        setPool(pools.formattedData[0]);
      }
    };
    fetchPools();
  }, [toawaot]);

  const isCpmm = pool && pool.programId === CREATE_CPMM_POOL_PROGRAM.toBase58()
  const { data: rpcAmmData, mutate: mutateAmm } = useFetchRpcPoolData({
    shouldFetch: !isCpmm,
    poolId: pool?.id
  })

  const { data: rpcCpmmData, mutate: mutateCpmm } = useFetchCpmmRpcPoolData({
    shouldFetch: isCpmm,
    poolId: pool?.id
  })

  const rpcData = isCpmm ? rpcCpmmData : rpcAmmData
  const mutateRpc = isCpmm ? mutateCpmm : mutateAmm

  const isPoolNotFound = !!tokenPair.base && !!tokenPair.quote && !isOrgLoading && !pool

  const lpBalance = getTokenBalanceUiAmount({
    mint: pool?.lpMint.address || '',
    decimals: pool?.lpMint.decimals
  })


  const [tabOptions, setTabOptions] = useState<TabItem[]>([])
  const [tabValue, setTabValue] = useState<LiquidityTabOptionType | undefined>(undefined)

  const [mode, setMode] = useState<LiquidityActionModeType>('add')

  const handleRefresh = useEvent(() => {
    fetchTokenAccountAct({})
  })

  const handleSelectToken = useCallback((token: TokenInfo | ApiV3Token, side: 'base' | 'quote') => {
    setTokenPair((pair) => {
      const anotherSide = side === 'base' ? 'quote' : 'base'

      return {
        [anotherSide]: pair[anotherSide]?.address === token.address ? undefined : pair[anotherSide],
        [side]: token.address
      }
    })
  }, [])

  useEffect(() => {
    if (!urlMode) {
      setUrlQuery({ mode: 'add' })
      return
    }
    setTabValue(urlMode === 'stake' ? 'Stake Liquidity' : 'Add Liquidity')
    if (urlMode != mode) {
      setMode(urlMode)
    }
  }, [urlMode])

  /** set default token pair onMount */
  useEffect(() => {
    if (!pool) return
    setTokenPair({
      base: wsolToSolToken(pool.mintA),
      quote: wsolToSolToken(pool.mintB)
    })
  }, [pool])


  const handleTabChange = useEvent((value: LiquidityTabOptionType) => {
    setTabValue(value)
    setUrlQuery({ mode: tabValueModeMapping[value] })
  })

  return (
    <>
      <Grid templateColumns={['unset', '.5fr .8fr .6fr']} gap={'clamp(16px, 1.5vw, 64px)'} mt={8}>
        {/* left */}
        <GridItem>
          <HStack
            onClick={() => {
              routeBack()
            }}
            cursor="pointer"
            color={colors.textTertiary}
            _hover={{ color: colors.textSecondary }}
          >
            <ChevronLeftIcon />
            <Text fontWeight="500" fontSize={['md', 'xl']}>
              {t('common.back')}
            </Text>
          </HStack>
        </GridItem>
        {/* main */}
        <GridItem>
          <VStack spacing={4}>
            {!increaseTabOptions[1].disabled && !lpBalance.isZero ? <StakeableHint /> : undefined}
            <Box {...panelCard} bg={colors.backgroundLight30} borderRadius="20px" overflow="hidden" w="full">
              <Text fontSize="sm" color="red.500" fontWeight="bold" mb={2}>
                For some fuckin reason u need to set this way lower than u expecc
              </Text>
              <Tabs isFitted items={tabOptions} size="md" variant="folder" value={tabValue} onChange={handleTabChange} />
              {mode === 'add' ? (
                <AddLiquidity
                  pool={pool}
                  isLoading={isOrgLoading}
                  poolNotFound={isPoolNotFound}
                  rpcData={rpcData}
                  mutate={mutateRpc}
                  onSelectToken={handleSelectToken}
                  onRefresh={handleRefresh}
                  tokenPair={{
                    base: tokenPair.base,
                    quote: tokenPair.quote
                  }}
                />
              ) : null}

            </Box>
          </VStack>
        </GridItem>
        {/* right */}
        <GridItem>
          <VStack maxW={['revert', '400px']} justify="flex-start" align="stretch" spacing={4}>
            <PoolInfo
              pool={
                pool && rpcData
                  ? {
                      ...pool,
                      mintAmountA: new Decimal(rpcData.baseReserve.toString()).div(10 ** pool.mintA.decimals).toNumber(),
                      mintAmountB: new Decimal(rpcData.quoteReserve.toString()).div(10 ** pool.mintB.decimals).toNumber()
                    }
                  : pool
              }
            />
            <PositionBalance
              myPosition={Number(lpBalance.amount.mul(pool?.lpPrice ?? 0).toFixed(pool?.lpMint.decimals ?? 6))}
              staked={1}
              unstaked={lpBalance.isZero ? '--' : lpBalance.text}
            />
          </VStack>
        </GridItem>
      </Grid>
    </>
  )
}
