import { useMemo } from 'react'
import { Heading, SimpleGrid } from '@chakra-ui/react'
import { colors } from '@/theme/cssVariables'
import useAllStandardPoolPosition from '@/hooks/portfolio/useAllStandardPoolPosition'
import PortfolioIdle from './components/PortfolioIdle'
import PortfolioInfo from './components/PortfolioInfo'
import useTokenBalance from '@/hooks/portfolio/useTokenBalance'
import Decimal from 'decimal.js'
import { useTranslation } from 'react-i18next'

export enum AssetType {
  STANDARD = 'Standard',
  CONCENTRATED = 'Concentrated',
  ALL = 'All'
}
export default function SectionOverview() {
  const { t } = useTranslation()
  const { idleList, idleBalance } = useTokenBalance()
const clmmPoolAssets: any = []
const totalClmmPosition = 0 
const clmmBalanceByMint = {}


const {
    data: standardPoolList,
    standardPoolListByMint,
    totalUSD: totalStandardPosition
  } = useAllStandardPoolPosition({ type: AssetType.STANDARD })

  const productiveBalance = (totalStandardPosition).toString()

  const tokenAssetsNew = useMemo(() => {
    const total: any = { ...clmmBalanceByMint }
    Object.keys(standardPoolListByMint).forEach((key) => {

      // @ts-ignore
      const data = standardPoolListByMint[key]
      total[key] = {
        mint: total[key]?.mint || data.mint,
        amount: new Decimal(total[key]?.amount || 0).add(data.amount).toString(),
        usd: new Decimal(total[key]?.usd || 0).add(data.usd).toString()
      }
    })
    return Object.values(total).map((data) => ({
      // @ts-ignore
      key: data.mint?.symbol || data.mint.address.slice(0, 6),
      // @ts-ignore
      value: data.usd,
      // @ts-ignore
      percentage: new Decimal(data.usd).div(new Decimal(productiveBalance).add(idleBalance)).mul(100).toDecimalPlaces(2).toNumber()
    }))
  }, [standardPoolListByMint])

  return (
    <>
      <Heading id="overview" fontSize={['lg', 'xl']} fontWeight="500" mb={[2, 4]} mt={[3, 6]} color={colors.textPrimary}>
        {t('portfolio.section_overview')}
      </Heading>
      <SimpleGrid templateColumns={['1fr 1fr']} gap={[3, 8]} overflow={['scroll']} mx={[-5, 0]} px={[5, 0]} scrollSnapType={'x'}>
        <PortfolioInfo poolAssets={[...standardPoolList, ...clmmPoolAssets]} tokenAssets={tokenAssetsNew} />
        <PortfolioIdle idleBalance={idleBalance.toString()} productiveBalance={productiveBalance} idleList={idleList} />
      </SimpleGrid>
    </>
  )
}
