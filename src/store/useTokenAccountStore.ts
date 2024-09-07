import {
  parseTokenAccountResp,
  TokenAccount,
  TokenAccountRaw,
  WSOLMint,
  splAccountLayout,
  getATAAddress,
  TxBuilder
} from '@raydium-io/raydium-sdk-v2'
import { PublicKey, KeyedAccountInfo, Commitment, AccountInfo, RpcResponseAndContext, GetProgramAccountsResponse } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createTransferInstruction
} from '@solana/spl-token'
import { formatLocaleStr } from '@/utils/numberish/formatter'
import { trimTailingZero } from '@/utils/numberish/formatNumber'
import createStore from './createStore'
import { useAppStore } from './useAppStore'
import { useTokenStore } from './useTokenStore'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import { txStatusSubject } from '@/hooks/toast/useTxStatus'
import { TxCallbackProps } from '../types/tx'
import { retry } from '@/utils/common'

import Decimal from 'decimal.js'
import BN from 'bn.js'
import logMessage from '@/utils/log'

export interface TokenAccountStore {
  tokenAccounts: TokenAccount[]
  tokenAccountRawInfos: TokenAccountRaw[]
  tokenAccountMap: Map<string, TokenAccount[]>

  refreshClmmPositionTag: number
  refreshTokenAccTime: number

  fetchTokenAccountAct: (params: { commitment?: Commitment; forceFetch?: boolean }) => Promise<void>
  updateTokenAccountAct: () => void
  getTokenBalanceUiAmount: (params: { mint: string | PublicKey; decimals?: number; isNative?: boolean }) => {
    rawAmount: Decimal
    amount: Decimal
    decimals: number
    text: string
    localeText: string
    isZero: boolean
    gt: (val: string) => boolean
  }
  migrateATAAct: (props: { migrateAccounts: TokenAccount[] } & TxCallbackProps) => Promise<void>
  reset: () => void
}

export const initTokenAccountSate = {
  tokenAccounts: [],
  tokenAccountRawInfos: [],
  tokenAccountMap: new Map(),
  refreshClmmPositionTag: 0,
  refreshTokenAccTime: Date.now()
}

let [loading, lastFetchTime, preOwner, preCommitment]: [boolean, number, PublicKey, Commitment | undefined] = [
  false,
  0,
  PublicKey.default,
  undefined
]

export const batchUpdateAccountData: {
  tokenAccounts: Map<string, KeyedAccountInfo>
  deleteAccount: Set<string>
  solAmount?: BN
} = {
  tokenAccounts: new Map(),
  deleteAccount: new Set()
}

export const clearUpdateTokenAccData = () => {
  batchUpdateAccountData.deleteAccount.clear()
  batchUpdateAccountData.tokenAccounts.clear()
  batchUpdateAccountData.solAmount = undefined
}

export const useTokenAccountStore = createStore<TokenAccountStore>(
  (set, get) => ({
    ...initTokenAccountSate,
    updateTokenAccountAct: () => {
      console.log('Starting updateTokenAccountAct');
      const owner = useAppStore.getState().publicKey!
      if (!owner) return
      console.log('Owner:', owner.toString());
      
      const readyUpdateDataMap: Map<string, TokenAccount> = new Map()
      const readyUpdateRawDataMap: Map<string, TokenAccountRaw> = new Map()

      console.log('Processing batchUpdateAccountData');
      Array.from(batchUpdateAccountData.tokenAccounts.entries()).forEach(([publicKey, data]) => {
        const accountInfo = splAccountLayout.decode(data.accountInfo.data)
        const { mint, amount } = accountInfo
        const [accountPublicKey, tokenProgram] = [data.accountId, data.accountInfo.owner]
        const updateData = {
          publicKey: accountPublicKey,
          mint,
          amount,
          isAssociate: getATAAddress(owner, mint, data.accountInfo.owner).publicKey.equals(accountPublicKey),
          isNative: mint.equals(PublicKey.default),
          programId: tokenProgram
        }
        readyUpdateDataMap.set(publicKey, updateData)
        readyUpdateRawDataMap.set(publicKey, { pubkey: accountPublicKey, accountInfo, programId: tokenProgram })
      })
      console.log('Processed batchUpdateAccountData. readyUpdateDataMap size:', readyUpdateDataMap.size);

      const { tokenAccounts, tokenAccountRawInfos } = get()
      console.log('Current tokenAccounts count:', tokenAccounts.length);
      const updatedSet = new Set()
      console.log('Creating new token account map');
      const newTokenAccountMap: Map<string, TokenAccount[]> = new Map();
      console.log('New token account map created:', newTokenAccountMap);
      const newTokenAccounts = tokenAccounts
        .map((acc) => {
          if (batchUpdateAccountData.solAmount && acc.mint.equals(PublicKey.default)) {
            console.log('Updating SOL account');
            const updateData = { ...acc, amount: batchUpdateAccountData.solAmount }
            newTokenAccountMap.set(PublicKey.default.toString(), [updateData])
            return updateData
          }
          const mintStr = acc.mint.toString()
          const accPubicKey = acc.publicKey?.toString() || ''
          const updateData = readyUpdateDataMap.get(accPubicKey)
          acc.amount = batchUpdateAccountData.deleteAccount.has(accPubicKey) ? new BN(0) : acc.amount

          if (!newTokenAccountMap.has(mintStr)) {
            newTokenAccountMap.set(mintStr, [updateData || acc])
          } else {
            newTokenAccountMap.get(mintStr)!.push(updateData || acc)
          }

          if (updateData) {
            updatedSet.add(accPubicKey)
            console.log('Updated account:', accPubicKey);
            return updateData
          }
          return acc
        })
        .filter((acc) => !batchUpdateAccountData.deleteAccount.has(acc.publicKey?.toString() || ''))
      console.log('Processed existing accounts. New count:', newTokenAccounts.length);

      if (updatedSet.size !== readyUpdateDataMap.size) {
        console.log('Processing new ATAs');
        const newAtaList = Array.from(readyUpdateDataMap.values()).filter((tokenAcc) => !updatedSet.has(tokenAcc.publicKey?.toString()))
        console.log('New ATA count:', newAtaList.length);
        if (newAtaList.length)
          newAtaList.forEach((data) => {
            const mintStr = data.mint.toString()
            newTokenAccounts.push(data)

            if (!newTokenAccountMap.has(mintStr)) {
              newTokenAccountMap.set(mintStr, [data])
            } else {
              newTokenAccountMap.get(mintStr)!.push(data)
            }
            console.log('Added new ATA for mint:', mintStr);
          })
      }
      updatedSet.clear()

      console.log('Processing raw token account infos');
      const newTokenAccountRawInfos = tokenAccountRawInfos
        .map((acc) => {
          acc.accountInfo.amount = batchUpdateAccountData.deleteAccount.has(acc.pubkey.toString()) ? new BN(0) : acc.accountInfo.amount
          const updateData = readyUpdateRawDataMap.get(acc.pubkey.toString())
          if (updateData) {
            updatedSet.add(acc.pubkey.toString())
            console.log('Updated raw account info:', acc.pubkey.toString());
            return updateData
          }
          return acc
        })
        .filter((acc) => !batchUpdateAccountData.deleteAccount.has(acc.pubkey.toString()))
      console.log('Processed raw token account infos. New count:', newTokenAccountRawInfos.length);

      if (updatedSet.size !== readyUpdateDataMap.size) {
        console.log('Processing new raw ATAs');
        const newAtaList = Array.from(batchUpdateAccountData.tokenAccounts.values()).filter(
          (tokenAcc) => !updatedSet.has(tokenAcc.accountId.toString())
        )
        console.log('New raw ATA count:', newAtaList.length);
        if (newAtaList.length)
          newAtaList.forEach((data) =>
            newTokenAccountRawInfos.push({
              pubkey: data.accountId,
              accountInfo: splAccountLayout.decode(data.accountInfo.data),
              programId: readyUpdateDataMap.get(data.accountId.toString())!.programId!
            })
          )
      }

      console.log('Setting new state');
      set(
        {
          tokenAccounts: newTokenAccounts,
          tokenAccountRawInfos: newTokenAccountRawInfos,
          tokenAccountMap: newTokenAccountMap,
          getTokenBalanceUiAmount: get().getTokenBalanceUiAmount.bind(this)
        },
        false,
        {
          type: 'updateTokenAccountAct'
        }
      )
      console.log('State updated successfully');
    },
    fetchTokenAccountAct: async ({ commitment, forceFetch }) => {
      console.log('Starting fetchTokenAccountAct');
      const { connection, publicKey: owner } = useAppStore.getState()
      if (!owner || !connection) {
        console.log('No owner or connection, exiting');
        return;
      }
      if (!forceFetch && (loading || (Date.now() - lastFetchTime < 3000 && owner.equals(preOwner) && commitment === preCommitment))) {
        console.log('Skipping fetch due to recent update or loading state');
        return;
      }
      preCommitment = commitment
      loading = true
      preOwner = owner
      try {
        console.log('Fetching owner account info');
        const solAccountResp = await retry<Promise<AccountInfo<Buffer>>>(() =>
          connection.getAccountInfo(owner, { commitment: useAppStore.getState().commitment })
        )
        console.log('Fetching owner token account info');
        const tokenAccountResp = await retry<Promise<RpcResponseAndContext<GetProgramAccountsResponse>>>(() =>
          connection.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, { commitment: useAppStore.getState().commitment })
        )
        console.log('Fetching owner token2022 account info');
        const token2022Req = await retry<Promise<RpcResponseAndContext<GetProgramAccountsResponse>>>(() =>
          connection.getTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, { commitment: useAppStore.getState().commitment })
        )

        lastFetchTime = Date.now()
        loading = false
        console.log('Parsing token account response');
        const tokenAccountData = parseTokenAccountResp({
          owner,
          solAccountResp,
          tokenAccountResp: {
            context: tokenAccountResp.context,
            value: [...tokenAccountResp.value, ...token2022Req.value]
          }
        })

        const tokenAccountMap: Map<string, TokenAccount[]> = new Map()
        console.log('Processing token accounts');
        tokenAccountData.tokenAccounts.forEach((tokenAccount) => {
          const mintStr = tokenAccount.mint?.toBase58()
          if (!tokenAccountMap.has(mintStr)) {
            tokenAccountMap.set(mintStr, [tokenAccount])
            return
          }
          tokenAccountMap.get(mintStr)!.push(tokenAccount)
        })

        console.log('Sorting token accounts');
        tokenAccountMap.forEach((tokenAccount) => {
          tokenAccount.sort((a, b) => (a.amount.lt(b.amount) ? 1 : -1))
        })

        clearUpdateTokenAccData()
        console.log('Setting new state');
        set(
          {
            ...tokenAccountData,
            tokenAccountMap,
            refreshTokenAccTime: Date.now(),
            getTokenBalanceUiAmount: get().getTokenBalanceUiAmount.bind(this)
          },
          false,
          {
            type: 'fetchTokenAccountAct'
          }
        )

        console.log('Sorting token list');
        const tokenList = useTokenStore.getState().tokenList.sort((tokenA, tokenB) => {
          const accountA = tokenAccountMap.get(tokenA.address)
          const accountB = tokenAccountMap.get(tokenB.address)
          const amountA = new Decimal(accountB?.[0].amount.toString() || 0)
          const amountB = new Decimal(accountA?.[0].amount.toString() || 0)
          if (amountB.gt(amountA)) return 1
          if (amountB.eq(amountA)) return 0
          return -1
        })
        console.log('Updating token store');
        useTokenStore.setState({ tokenList: JSON.parse(JSON.stringify(tokenList)) }, false, { type: 'fetchTokenAccountAct' })
        console.log('Updating app store');
        useAppStore.setState({ tokenAccLoaded: true })
        console.log('fetchTokenAccountAct completed successfully');
      } catch (e: any) {
        loading = false
        console.error('Error in fetchTokenAccountAct:', e);
        toastSubject.next({
          status: 'error',
          title: 'fetch token account error',
          detail: e.message
        })
      }
    },
    getTokenBalanceUiAmount: ({ mint: mintKey, decimals, isNative = true }) => {
      console.log('Starting getTokenBalanceUiAmount for mint:', mintKey?.toString());
      const mint = mintKey?.toString()
      const defaultVal = {
        rawAmount: new Decimal(0),
        amount: new Decimal(0),
        text: '0',
        localeText: '0',
        decimals: 0,
        isZero: true,
        gt: () => false
      }

      const tokenInfo = useTokenStore.getState().tokenMap.get(mint)
      const tokenDecimal = decimals ?? tokenInfo?.decimals ?? 6
      console.log('Token decimals:', tokenDecimal);
      const tokenAccount =
        get()
          .tokenAccountMap.get(mint)
          ?.find((acc) => acc.isAssociated || acc.isNative === isNative) || get().tokenAccountMap.get(mint)?.[0]
      if (!tokenAccount) {
        

        console.log('No token account found, returning default value');
        return defaultVal;
      }
      if (!tokenInfo && decimals === undefined) {

        console.log('No token info and no decimals provided, returning default value');
        return defaultVal;
      }

      let amount = new Decimal(tokenAccount.amount.toString())
      console.log('Raw amount:', amount.toString());
      // wsol might have lots of ata, so sum them up
      if (mint === WSOLMint.toBase58()) {
        console.log('Processing WSOL');
        amount = new Decimal(0)
        get()
          .tokenAccountMap.get(mint)!
          .forEach((acc) => {
            amount = amount.add(acc.amount.toString())
          })
        console.log('Total WSOL amount:', amount.toString());
      }

      const decimalAmount = new Decimal(amount.toString()).div(10 ** tokenDecimal)
      console.log('Decimal amount:', decimalAmount.toString());

      const result = {
        rawAmount: amount,
        amount: decimalAmount,
        decimals: tokenDecimal,
        text: trimTailingZero(decimalAmount.toFixed(tokenDecimal, Decimal.ROUND_FLOOR)),
        localeText: formatLocaleStr(decimalAmount.toFixed(tokenDecimal, Decimal.ROUND_FLOOR), tokenDecimal)!,
        isZero: amount.eq(0),
        gt: (val: string) => !!val && amount.gt(val)
      };
      console.log('Returning result:', result);
      return result;
    },
    migrateATAAct: async ({ migrateAccounts, ...txProps }) => {
      console.log('Starting migrateATAAct');
      const { connection, publicKey, signAllTransactions } = useAppStore.getState()
      const tokenAccounts = get().tokenAccounts
      if (!connection || !publicKey || !signAllTransactions || !tokenAccounts.length) {
        console.log('Missing required data, exiting');
        return;
      }

      console.log('Creating TxBuilder');
      const txBuilder = new TxBuilder({ connection, cluster: 'mainnet', feePayer: publicKey, signAllTransactions })

      console.log('Processing migrateAccounts');
      migrateAccounts.forEach((tokenAcc) => {
        if (!tokenAcc.publicKey) {
          console.log('Skipping account without publicKey');
          return;
        }
        const ata = getAssociatedTokenAddressSync(tokenAcc.mint, publicKey!, false, tokenAcc.programId)
        const ataExists = !!tokenAccounts.find((acc) => acc.publicKey && acc.publicKey.equals(tokenAcc.publicKey!))
        if (!ataExists) {
          console.log('Adding instruction to create ATA');
          txBuilder.addInstruction({
            instructions: [createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, tokenAcc.mint, tokenAcc.programId)]
          })
        }

        if (!tokenAcc.amount.isZero()) {
          console.log('Adding instruction to transfer tokens');
          txBuilder.addInstruction({
            instructions: [
              createTransferInstruction(tokenAcc.publicKey, ata, publicKey, BigInt(tokenAcc.amount.toString()), [], tokenAcc.programId)
            ]
          })
        }

        console.log('Adding instruction to close account');
        txBuilder.addInstruction({
          instructions: [createCloseAccountInstruction(tokenAcc.publicKey, publicKey, publicKey, [], tokenAcc.programId)]
        })
      })

      if (!txBuilder.allInstructions.length) {
        console.log('No instructions to execute');
        toastSubject.next({
          status: 'error',
          title: 'Migrate ATA',
          description: 'not ata needs to be migrated'
        })
        return
      }
      console.log('Executing transaction');
      txBuilder
        .build()
        .execute()
        .then(({ txId, signedTx }) => {
          console.log('Transaction executed successfully. TxId:', txId);
          txStatusSubject.next({ txId, signedTx })
          txProps.onSent?.()
        })
        .catch((e) => {
          console.error('Error executing transaction:', e);
          toastSubject.next({ txError: e })
          txProps.onError?.()
        })
        .finally(txProps.onFinally)
    },
    reset: () => {
      set(initTokenAccountSate)
    }
  }),
  'useTokenAccountStore'
)
