import { PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js'
import { TxVersion, printSimulate, SOL_INFO, MakeTxData, getPdaAmmConfigId, CpmmPoolInfoLayout, CpmmConfigInfoLayout, getPdaPoolAuthority, getPdaVault } from '@raydium-io/raydium-sdk-v2'
import { createStore, useAppStore, useTokenStore } from '@/store'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import { txStatusSubject, TOAST_DURATION } from '@/hooks/toast/useTxStatus'
import { ApiSwapV1OutSuccess } from './type'
import { isSolWSol } from '@/utils/token'
import axios from '@/api/axios'
import { getTxMeta } from './swapMeta'
import { formatLocaleStr } from '@/utils/numberish/formatter'
import { getMintSymbol } from '@/utils/token'
import Decimal from 'decimal.js'
import { TxCallbackProps } from '@/types/tx'
import i18n from '@/i18n'
import { fetchComputePrice } from '@/utils/tx/computeBudget'
import { trimTailingZero } from '@/utils/numberish/formatNumber'
import { getDefaultToastData, handleMultiTxToast } from '@/hooks/toast/multiToastUtil'
import { handleMultiTxRetry } from '@/hooks/toast/retryTx'
import { isSwapSlippageError } from '@/utils/tx/swapError'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import useFetchPoolById from '@/hooks/pool/useFetchPoolById'
import { BN } from 'bn.js'

const getSwapComputePrice = async () => {
  const transactionFee = useAppStore.getState().getPriorityFee()
  if (isNaN(parseFloat(String(transactionFee) || ''))) {
    const json = await fetchComputePrice()
    const { avg } = json?.[15] ?? {}
    if (!avg) return undefined
    return {
      units: 600000,
      microLamports: avg
    }
  }
  return {
    units: 600000,
    microLamports: new Decimal(transactionFee as string)
      .mul(10 ** SOL_INFO.decimals)
      .toDecimalPlaces(0)
      .toNumber()
  }
}

interface SwapStore {
  slippage: number
  swapTokenAct: (
    props: { swapResponse: ApiSwapV1OutSuccess; wrapSol?: boolean; unwrapSol?: boolean; onCloseToast?: () => void } & TxCallbackProps
  ) => Promise<string | string[] | undefined>
  unWrapSolAct: (props: { amount: string; onClose?: () => void; onSent?: () => void; onError?: () => void }) => Promise<string | undefined>
  wrapSolAct: (amount: string) => Promise<string | undefined>
}

export interface ComputeParams {
  inputMint: string
  outputMint: string
  amount: string
}

export const SWAP_SLIPPAGE_KEY = '_r_swap_slippage_'
const initSwapState = {
  slippage: 0.005
}

export const useSwapStore = createStore<SwapStore>(
  () => ({
    ...initSwapState,

    swapTokenAct: async ({ swapResponse, wrapSol, unwrapSol = false, onCloseToast, ...txProps }) => {
      const { publicKey, raydium, txVersion, connection, signAllTransactions, urlConfigs } = useAppStore.getState()
      if (!raydium || !connection) {
        console.error('no connection')
        return
      }
      if (!publicKey || !signAllTransactions) {
        console.error('no wallet')
        return
      }

        const tokenMap = useTokenStore.getState().tokenMap
        console.log(swapResponse)
        // @ts-ignore
        // Add route information from swapResponse.data.routes[0] to swapResponse.data
        if (swapResponse.data.routes && swapResponse.data.routes.length > 0) {
          // @ts-ignore
          const route = swapResponse.data.routes[0];
          swapResponse.data = {
            ...swapResponse.data,
            // @ts-ignore
            poolId: route.poolId,
            inputMint: route.inputMint,
            outputMint: route.outputMint,
            feeMint: route.feeMint,
            feeRate: route.feeRate,
            feeAmount: route.feeAmount
          };
        }
        // @ts-ignore
        const [inputToken, outputToken] = [(swapResponse.inputMint) as any, (swapResponse.outputMint) as any]
        const [isInputSol, isOutputSol] = [isSolWSol(swapResponse.data.inputMint), isSolWSol(swapResponse.data.outputMint)]
        const inputTokenAcc = await raydium.account.getCreatedTokenAccount({
          programId: new PublicKey(inputToken.programId ?? TOKEN_PROGRAM_ID),
          mint: new PublicKey(inputToken.address),
          associatedOnly: false
        })

        if (!inputTokenAcc && !isInputSol) {
          console.error('no input token acc')
          return
        }

        const outputTokenAcc = await raydium.account.getCreatedTokenAccount({
          programId: new PublicKey(outputToken.programId ?? TOKEN_PROGRAM_ID),
          mint: new PublicKey(outputToken.address)
        })

        const computeData = await getSwapComputePrice()

        const isV0Tx = txVersion === TxVersion.V0
       
        let swapTransactions;
        // @ts-ignore 
        if (Math.round(Number(swapResponse.inputAmount ?? 0)) == undefined ) return 
        // @ts-ignore
        const pi = await swapResponse.data.routes[0]
        var poolInfo = ((await connection.getAccountInfo(new PublicKey(pi.id)))?.data as Buffer);
        const configInfo = await connection.getAccountInfo(new PublicKey(poolInfo.slice(8, 40)));
        const config = CpmmConfigInfoLayout.decode(configInfo?.data as Buffer);
        const normalizedConfig = {
          id: new PublicKey(poolInfo.slice(8, 40)).toString(),
          protocolFeeRate: 12000,
          tradeFeeRate: 2500,
          fundFeeRate: 2500,
          fundOwner: config.fundOwner,
          disableCreatePool: config.disableCreatePool,
          createPoolFee: config.createPoolFee.toString(),
          protocolOwner: config.protocolOwner,
          bump: config.bump,
          index: config.index
        }
        // @ts-ignore
        var poolInfo2 = {
          programId: ("CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj"),
          id: pi.id,
          mintA: pi.mintA,
          mintB: pi.mintB,
          rewardDefaultInfos: pi.rewardDefaultInfos,
          rewardDefaultPoolInfos: pi.rewardDefaultPoolInfos,
          price: pi.price,
          mintAmountA: pi.mintAmountA,
          mintAmountB: pi.mintAmountB,
          feeRate: pi.feeRate,
          tvl: pi.tvl,
          day: pi.day,
          week: pi.week,
          month: pi.month,
          pooltype: pi.pooltype,
          farmUpcomingCount: pi.farmUpcomingCount,
          farmOngoingCount: pi.farmOngoingCount,
          farmFinishedCount: pi.farmFinishedCount,
          type: "Standard" as any,
          lpMint: pi.lpMint,
          lpPrice: pi.lpPrice,
          lpAmount: pi.lpAmount,
          config:normalizedConfig
      }
        swapTransactions = [(await raydium.cpmm.swap({
          poolKeys: {
            mintLp: pi.lpMint,
            programId: new PublicKey("CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj").toBase58(),
            mintA: pi.mintA,
            mintB: pi.mintB,
            id: pi.id,
            authority: getPdaPoolAuthority(new PublicKey(new PublicKey("CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj"))).publicKey.toBase58(),
            config: normalizedConfig,
            vault: {
              A: getPdaVault(new PublicKey("CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj"), new PublicKey(pi.id), new PublicKey(pi.mintA.address)).publicKey.toBase58(),
              B: getPdaVault(new PublicKey("CVF4q3yFpyQwV8DLDiJ9Ew6FFLE1vr5ToRzsXYQTaNrj"), new PublicKey(pi.id), new PublicKey(pi.mintB.address)).publicKey.toBase58()
            },
          },
          poolInfo: poolInfo2,
          baseIn: swapResponse.data.swapType === 'BaseIn',
          swapResult: {
            // @ts-ignore
            newSwapSourceAmount: new BN(Math.round(Number(swapResponse.inputAmount ?? 0))),
            // @ts-ignore
            newSwapDestinationAmount: new BN(Math.round(Number(swapResponse.outputAmount ?? 0))),
            // @ts-ignore
            sourceAmountSwapped: new BN(Math.round(Number(swapResponse.inputAmount ?? 0))),
            // @ts-ignore
            destinationAmountSwapped: new BN(Math.round(Number(swapResponse.outputAmount ?? 0))),
            tradeFee: new BN(0),
          },
          // @ts-ignore
          inputAmount: new BN(Math.round(Number(swapResponse.inputAmount ?? 0))),
          // @ts-ignore
          slippage: Number(swapResponse.slippageBps),
          computeBudgetConfig: {units: 1_400_000, microLamports: 333333},
          txVersion: TxVersion.LEGACY
        })).execute()]
      return ''
    },

    unWrapSolAct: async ({ amount, onSent, onError, ...txProps }): Promise<string | undefined> => {
      const raydium = useAppStore.getState().raydium
      if (!raydium) return
      const { execute } = await raydium.tradeV2.unWrapWSol({
        amount
        // computeBudgetConfig: await getComputeBudgetConfig()
      })

      const values = { amount: trimTailingZero(new Decimal(amount).div(10 ** SOL_INFO.decimals).toFixed(SOL_INFO.decimals)) }
      const meta = {
        title: i18n.t('swap.unwrap_all_wsol', values),
        description: i18n.t('swap.unwrap_all_wsol_desc', values),
        txHistoryTitle: 'swap.unwrap_all_wsol',
        txHistoryDesc: 'swap.unwrap_all_wsol_desc',
        txValues: values
      }

      return execute()
        .then(({ txId, signedTx }) => {
          onSent?.()
          txStatusSubject.next({ txId, signedTx, ...meta, ...txProps })
          return txId
        })
        .catch((e) => {
          onError?.()
          toastSubject.next({ txError: e, ...meta })
          return ''
        })
    },

    wrapSolAct: async (amount: string): Promise<string | undefined> => {
      const raydium = useAppStore.getState().raydium
      if (!raydium) return
      const { execute } = await raydium.tradeV2.wrapWSol(new Decimal(amount).mul(10 ** SOL_INFO.decimals).toFixed(0))
      return execute()
        .then(({ txId, signedTx }) => {
          txStatusSubject.next({ txId, signedTx })
          return txId
        })
        .catch((e) => {
          toastSubject.next({ txError: e })
          return ''
        })
    }
  }),
  'useSwapStore'
)
