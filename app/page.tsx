'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowUpDown, RefreshCcw, ChevronDown, ChevronUp, Menu, Search, Link } from 'lucide-react'
import { Button } from "@/components/ui/button"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"

import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from '@/hooks/use-toast'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { CurveLaunchpad } from '@/components/types/curve_launchpad'
import * as IDL from '@/components/types/curve_launchpad.json'
import { AMM } from '@/utils/amm'
import { BN } from 'bn.js'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useRouter } from 'next/navigation'
import { Modal, Button as MantineButton, TextInput, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { FileInput } from '@mantine/core';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { MEMO_PROGRAM_ID } from 'tokengobbler';
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token';
import { getAmmConfigAddress, getAuthAddress, getOrcleAccountAddress, getPoolAddress, getPoolLpMintAddress, getPoolVaultAddress } from '@/components/types/raydium'
import { ApiV3PoolInfoStandardItemCpmm, Percent, Raydium } from '@raydium-io/raydium-sdk-v2'
type Greek = {
  mint: string
  lastPrice: number
  volatility: number
  solBalance?: number
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
  balance: number
  metadata?: {
    name: string
    symbol: string
    image: string,
    description: string
  }
  candles: {
    timestamp: number
    close: number
  }[]
}

export default function GracefulRefreshFinancialGreeksUI() {
  const [greeks, setGreeks] = useState<Greek[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: keyof Greek; direction: 'asc' | 'desc' }>({ key: 'lastPrice', direction: 'desc' })
  const [isLoading, setIsLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set())
  const [amountPercentage, setAmountPercentage] = useState<number>(1)
  const [isBuying, setIsBuying] = useState(false)
  const [isSelling, setIsSelling] = useState(false)
  const [solBalance, setSolBalance] = useState<number>(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [newImage, setNewImage] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { connection } = useConnection()
  const wallet = useWallet()
  const wallet2 = useAnchorWallet()

  const program = wallet2 ? new Program<CurveLaunchpad>(IDL as any, new AnchorProvider(connection, wallet2, {})) : null

  const { toast } = useToast()
  const handleUpdateMetadata = useCallback(async () => {
    if (!selectedMint || !wallet2 ||!wallet2.publicKey || !connection || !program) return;
  
    setIsUpdating(true);
    try {
      const umi = createUmi(connection.rpcEndpoint)
        .use(irysUploader())
        .use(mplToolbox())
        .use(walletAdapterIdentity(wallet as any));
      const bribeAccount = PublicKey.findProgramAddressSync(
        [Buffer.from("bribe")],
        new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9")
      )[0];
      let bribe : any | null = null
      try { 
       bribe = await program.account.bribe.fetch(bribeAccount);
      } catch (error) {
        console.log("bribe", error)
      }
      console.log("bribe", bribe)
      let imageUri = '';
      if (newImage) {
        const genericFile = {
          buffer: new Uint8Array(await newImage.arrayBuffer()),
          fileName: newImage.name,
          displayName: newImage.name,
          uniqueName: `${Date.now()}-${newImage.name}`,
          contentType: newImage.type,
          extension: newImage.name.split('.').pop() || '',
          tags: []
        };
        const [uploadedUri] = await umi.uploader.upload([genericFile]);
        const response = await fetch(uploadedUri);
        imageUri = response.url;
      }
  
      const selectedGreek = greeks.find(g => g.mint === selectedMint);
      const metadata = {
        name: selectedGreek?.metadata?.name || '',
        symbol: selectedGreek?.metadata?.symbol || '',
        description: "This token was updated on fomo4d.fun for " + (bribe != null? new BN(Number(bribe.amount.toString())*1.02).toString() : new BN(1_000_000)).toString() + " sol! " + newDescription,
        image: imageUri || selectedGreek?.metadata?.image || '',
      };
  
      metadata.description += '\n\nThis metadata was updated on fomo3d.fun';
  
      const metadataUri = await umi.uploader.uploadJson(metadata);
      const metadataResponse = await fetch(metadataUri);
      const tokenUri = metadataResponse.url;
  
      const tx = await program.methods
        .bribeMetadata(tokenUri,bribe != null? new BN(Number(bribe.amount.toString())*1.02) : new BN(1_000_000))
        .accounts({
          mint: new PublicKey(selectedMint),
          authority: wallet2.publicKey,
          tokenProgram2022: TOKEN_2022_PROGRAM_ID,
          hydra: new PublicKey("AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ"),
          claimer: bribe != null? bribe.lastBriber : wallet2.publicKey,
        })
        .transaction();
  
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = wallet2.publicKey;
  
      const signed = await wallet2.signTransaction(tx);
      const txSignature = await connection.sendRawTransaction(signed.serialize());
      console.log('Metadata update transaction:', txSignature);
  
      toast({
        title: "Metadata Updated",
        description: "Token metadata has been successfully updated.",
      });
  
      close();
      fetchGreeks(true);
    } catch (error) {
      console.error('Error updating metadata:', error);
      toast({
        title: "Error",
        description: "Failed to update metadata. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  }, [selectedMint, newDescription, newImage, wallet, connection, program, close, toast]);
  const lastFetchTime = useRef<number>(0)
  const cachedGreeks = useRef<Greek[]>([])

  const fetchGreeks = useCallback(async (force: boolean = false) => {
    const now = Date.now()
    if (!force && now - lastFetchTime.current < 5000) {
      return // Prevent fetching more often than every 5 seconds
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/bump')
      const data = await response.json()

      if (wallet.publicKey) {
        const updatedGreeks = await Promise.all(data.map(async (greek: Greek) => {
          const tokenAccount = await connection.getTokenAccountsByOwner(wallet.publicKey!, { mint: new PublicKey(greek.mint) })
          if (tokenAccount.value.length > 0) {
            const balance = await connection.getTokenAccountBalance(tokenAccount.value[0].pubkey)
            const userBalance = parseFloat(balance.value.uiAmount?.toString() || '0')

            // Check SOL balance of the bonding curve account
            const bondingCurveAccount = PublicKey.findProgramAddressSync(
              [Buffer.from("bonding-curve"), new PublicKey(greek.mint).toBuffer()],
              new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9")
            )[0];
            const solBalance = await connection.getBalance(bondingCurveAccount)
            const solBalanceInSol = solBalance / LAMPORTS_PER_SOL

            return { ...greek, balance: userBalance, solBalance: solBalanceInSol }
          }
          return greek
        }))

        setGreeks(prevGreeks => {
          const newGreeks = updatedGreeks.map(newGreek => {
            const oldGreek = prevGreeks.find(g => g.mint === newGreek.mint)
            return oldGreek ? { ...oldGreek, ...newGreek } : newGreek
          })
          cachedGreeks.current = newGreeks
          return newGreeks
        })
      } else {
        setGreeks(data)
        cachedGreeks.current = data
      }

      lastFetchTime.current = now
    } catch (error) {
      console.error('Error fetching Greeks:', error)
      toast({
        title: "Error",
        description: "Failed to fetch latest data. Using cached data.",
        variant: "destructive",
      })
      setGreeks(cachedGreeks.current) // Use cached data on error
    } finally {
      setIsLoading(false)
    }
  }, [connection, wallet.publicKey, toast])

  const fetchSolBalance = useCallback(async () => {
    if (wallet.publicKey) {
      const balance = await connection.getBalance(wallet.publicKey)
      setSolBalance(balance / LAMPORTS_PER_SOL)
    }
  }, [connection, wallet.publicKey])

  useEffect(() => {
    fetchGreeks(true)
    fetchSolBalance()

    if (autoRefresh) {
      const intervalId = setInterval(() => {
        fetchGreeks()
        fetchSolBalance()
      }, 30000) // Refresh every 30 seconds
      return () => clearInterval(intervalId)
    }
  }, [fetchGreeks, fetchSolBalance, autoRefresh])

  const sortGreeks = (key: keyof Greek) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })

    setGreeks(prevGreeks => [...prevGreeks].sort((a: Greek, b: Greek) => {
      // @ts-ignore
      if (a[key] !== undefined && b[key] !== undefined) {
        // @ts-ignore
        if (a[key] < b[key]) return direction === 'asc' ? -1 : 1
        // @ts-ignore
        if (a[key] > b[key]) return direction === 'asc' ? 1 : -1
      }
      return 0
    }))
  }

  const toggleRowExpansion = (mint: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(mint)) {
        newSet.delete(mint)
      } else {
        newSet.add(mint)
      }
      return newSet
    })
  }

  const toggleTokenSelection = (mint: string) => {
    setSelectedTokens(prev => {
      const newSet = new Set(prev)
      if (newSet.has(mint)) {
        newSet.delete(mint)
      } else {
        newSet.add(mint)
      }
      return newSet
    })
  }

  const handleBuy = async () => {
    if (!wallet.publicKey) return
    setIsBuying(true)
    const txs: Transaction[] = []
    try {
      if (!program) {
        console.error('Program not initialized')
        return
      }
      const amountInSol = (solBalance * amountPercentage / 100) / selectedTokens.size 
      const amountInLamports = BigInt(Math.floor(amountInSol * LAMPORTS_PER_SOL))
  
      // Implement buy logic here for each selected token
      for (const mint of selectedTokens) {
        console.log(`Buying ${amountInSol} SOL worth of ${mint}`)
        // Fetch bonding curve data
        const bondingCurve = PublicKey.findProgramAddressSync(
          [Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()],
          new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9")
        );
        const accountData = (await connection.getAccountInfo(bondingCurve[0]))?.data;
        const bondingCurveData = accountData?.slice(8);

        if (!bondingCurveData) {
          console.error(`Failed to fetch bonding curve data for ${mint}`);
          continue;
        }

        const virtualSolReserves = bondingCurveData.readBigUInt64LE(0);
        const virtualTokenReserves = bondingCurveData.readBigUInt64LE(8);
        const realSolReserves = bondingCurveData.readBigUInt64LE(16);
        const realTokenReserves = bondingCurveData.readBigUInt64LE(24);

        const ammState = {
          virtualSolReserves: virtualSolReserves.toString(),
          virtualTokenReserves: virtualTokenReserves.toString(),
          realSolReserves: realSolReserves.toString(),
          realTokenReserves: realTokenReserves.toString(),
          initialVirtualTokenReserves: virtualTokenReserves.toString(), // Assuming initial is same as current
        };
        // Fetch the AMM state for this token
        const amm = new AMM(
          BigInt(ammState.virtualSolReserves),
          BigInt(ammState.virtualTokenReserves),
          BigInt(ammState.realSolReserves),
          BigInt(ammState.realTokenReserves),
          BigInt(ammState.initialVirtualTokenReserves)
        )
  
        // Calculate the token amount to buy based on the SOL amount
        const buyResult = amm.applyBuyWithSol(amountInLamports)
        const tokenAmount = buyResult.token_amount
        const maxSolAmount = buyResult.sol_amount
        const ammProgramId = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")
        
const ammConfig = getAmmConfigAddress(0, ammProgramId)[0];

const wsolMint = NATIVE_MINT;
const tokenMint = new PublicKey(mint);

const creatorTokenAccount = getAssociatedTokenAddressSync(tokenMint, wallet.publicKey, true, TOKEN_2022_PROGRAM_ID);
const poolState = getPoolAddress(ammConfig, wsolMint, tokenMint, ammProgramId)[0];
const ammAuthority = getAuthAddress(ammProgramId)[0];
const token0Vault = getPoolVaultAddress(poolState, wsolMint, ammProgramId)[0];
const token1Vault = getPoolVaultAddress(poolState, tokenMint, ammProgramId)[0];
const observationState = getOrcleAccountAddress(poolState, ammProgramId)[0];
const lpMint = getPoolLpMintAddress(poolState, ammProgramId)[0];
const creatorLpToken = getAssociatedTokenAddressSync(lpMint, wallet.publicKey);
const creatorLpTokenAccountMaybe = await connection.getAccountInfo(creatorLpToken)
const ixs = []
if (!creatorLpTokenAccountMaybe) {
  ixs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, creatorLpToken, wallet.publicKey, lpMint))
}

const raydium = await Raydium.load({
  owner: wallet.publicKey,
  connection,
  cluster: 'mainnet',
  disableFeatureCheck: true,
  disableLoadToken: true,
  blockhashCommitment: 'finalized',
  // urlConfigs: {
  //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
  // },
})

const data = await raydium.api.fetchPoolById({ ids: poolState.toString() })
const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
const baseReserve = await connection.getTokenAccountBalance(token0Vault)
const quoteReserve = await connection.getTokenAccountBalance(token1Vault)
const computeRes = await raydium.cpmm.computePairAmount({
  poolInfo,
  baseReserve: new BN(baseReserve.value.amount.toString()),
  quoteReserve: new BN(quoteReserve.value.amount.toString()),
  amount: new BN(tokenAmount.toString()).div(new BN(3)).div(new BN(10**9)).toString(),
  slippage: new Percent(10, 100),
  baseIn: false,
  epochInfo: await raydium.fetchEpochInfo()
})
console.log(computeRes.liquidity)
const global_lp_token = getAssociatedTokenAddressSync(lpMint, PublicKey.findProgramAddressSync([Buffer.from("global")], new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"))[0], true)
const global_lp_token_account_maybe = await connection.getAccountInfo(global_lp_token)

// Prepare the buy instruction
        const ix = await program.methods
          .buy(new BN(tokenAmount.toString()), new BN(Number.MAX_SAFE_INTEGER))
          
          .accounts({
            hydra: new PublicKey("AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ"),
            user: wallet.publicKey,
            mint: new PublicKey(mint),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"),
          })
          .instruction();

  

        // Prepare transaction
        const tx = new Transaction();
          if (ixs.length > 0) {
            tx.add(...ixs)
          }
        // Check if the user has an associated token account for this mint
        const ata = await getAssociatedTokenAddressSync(new PublicKey(mint), wallet.publicKey, true, TOKEN_2022_PROGRAM_ID);
        const ataAccount = await connection.getAccountInfo(ata);

        // If the ATA doesn't exist, add an instruction to create it
        if (!ataAccount) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              ata,
              wallet.publicKey,
              new PublicKey(mint),
              TOKEN_2022_PROGRAM_ID
            )
          );
        }

        // Add the buy instruction
        tx.add(ix);
        const ix2 = await program.methods
          .buy2(new BN(computeRes.liquidity.toString()), new BN(Number(amountInLamports.toString())/3))
          .accounts({
            user: wallet.publicKey,
            mint: new PublicKey(mint),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"),
          })
          .remainingAccounts([
            /*
        let authority = &mut next_account_info(remaning_accounts)?;
        let amm_config = &mut next_account_info(remaning_accounts)?;
        let pool_state = &mut next_account_info(remaning_accounts)?;
        let input_token_account = &mut next_account_info(remaning_accounts)?;
        let input_vault = &mut next_account_info(remaning_accounts)?;
        let output_vault = &mut next_account_info(remaning_accounts)?;
        let input_token_program =  &mut next_account_info(remaning_accounts)?;
        let output_token_program = &ctx.accounts.token_program;
        let input_token_mint = next_account_info(remaning_accounts)?;
        let observation_state = &mut next_account_info(remaning_accounts)?;
        let owner_lp_token = &mut next_account_info(remaning_accounts)?;
        let lp_mint = &mut next_account_info(remaning_accounts)?;
        let raydium_swap = &mut next_account_info(remaning_accounts)?;
    */
            { pubkey: ammAuthority, isWritable: false, isSigner: false },
            { pubkey: ammConfig, isWritable: false, isSigner: false },
            { pubkey: poolState, isWritable: true, isSigner: false },
            { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey, true), isWritable: true, isSigner: false },
            { pubkey: token0Vault, isWritable: true, isSigner: false },
            { pubkey: token1Vault, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: wsolMint, isWritable: false, isSigner: false },
            { pubkey: observationState, isWritable: true, isSigner: false },
            { pubkey: creatorLpToken, isWritable: true, isSigner: false },
            { pubkey: lpMint, isWritable: true, isSigner: false },
            { pubkey: ammProgramId, isWritable: false, isSigner: false },
            { pubkey: global_lp_token, isWritable: true, isSigner: false },
            { pubkey: ASSOCIATED_PROGRAM_ID, isWritable: false, isSigner: false },
          ])
          .instruction();
          const poolStateAccountMaybe = await connection.getAccountInfo(poolState)
        if (poolStateAccountMaybe) {
          tx.add(ix2)
        }
        // Set the recent blockhash and fee payer
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = wallet.publicKey;
        txs.push(tx)
        console.log('Buy transaction confirmed');
        try {
          const tradeResponse = await fetch('/api/trade', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              timestamp: Date.now(),
              mint: mint,
            }),
          })
          if (!tradeResponse.ok) {
            console.error('Error hitting /api/trade:', await tradeResponse.text())
          }
        } catch (error) {
          console.error('Error hitting /api/trade:', error)
        }
      }
      if (wallet.signAllTransactions) {
      const signed = await wallet.signAllTransactions(txs)
      for (const tx of signed) {
        const txSignature = await connection.sendRawTransaction(tx.serialize())
          console.log('Buy transaction sent:', txSignature);
        }
      }
    } catch (error) {
      console.error('Error buying tokens:', error)
    } finally {
      setIsBuying(false)
    }
  }
const tokenBalances = async () => {
  if (!wallet.publicKey) return
  const balances = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { programId: TOKEN_2022_PROGRAM_ID })
  const tokenBalancesWithGreeks = balances.value
    .filter(account => {
      const mintAddress = account.account.data.parsed.info.mint;
      return greeks.some(greek => greek.mint === mintAddress);
    })
    .map(account => {
      const mintAddress = account.account.data.parsed.info.mint;
      const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
      const greek = greeks.find(g => g.mint === mintAddress);
      return {
        mint: mintAddress,
        balance,
        ...greek
      };
    });

  console.log('Token balances with Greeks:', tokenBalancesWithGreeks);
  return {
    tokenBalancesWithGreeks
  }
}
  const handleSell = async () => {
    if (!wallet.publicKey || !program) return
    setIsSelling(true)
    try {
      const txs: Transaction[] = []
      for (const mint of selectedTokens) {
        const tokenBalance = await tokenBalances();
        if (!tokenBalance || !tokenBalance.tokenBalancesWithGreeks) {
          console.error('Failed to fetch token balances');
          continue;
        }
        const tokenInfo = tokenBalance.tokenBalancesWithGreeks.find(t => t.mint === mint);
        if (!tokenInfo) {
          console.error(`No balance found for token ${mint}`);
          continue;
        }
        const amount = tokenInfo.balance * 1e6;
        // Calculate the amount to sell based on the percentage
        const amountToSell = Math.floor(amount * (amountPercentage / 100));
        console.log(`Selling ${amountToSell} tokens (${amountPercentage}%) of ${mint}`);
        const tokenAmount = new BN(amountToSell)
        const minSolAmount = new BN(0)
        
const ammProgramId = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")
const ammConfig = getAmmConfigAddress(0, ammProgramId)[0];

const wsolMint = NATIVE_MINT;
const tokenMint = new PublicKey(mint);

const creatorTokenAccount = getAssociatedTokenAddressSync(tokenMint, wallet.publicKey, true, TOKEN_2022_PROGRAM_ID);
const poolState = getPoolAddress(ammConfig, wsolMint, tokenMint, ammProgramId)[0];
const ammAuthority = getAuthAddress(ammProgramId)[0];
const token0Vault = getPoolVaultAddress(poolState, wsolMint, ammProgramId)[0];
const token1Vault = getPoolVaultAddress(poolState, tokenMint, ammProgramId)[0];
const observationState = getOrcleAccountAddress(poolState, ammProgramId)[0];
const lpMint = getPoolLpMintAddress(poolState, ammProgramId)[0];
const creatorLpToken = getAssociatedTokenAddressSync(lpMint, wallet.publicKey);

async function getAmmFromBondingCurve(mint: PublicKey) {
  const bondingCurvePDA = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mint.toBuffer()],
      new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9")
  )[0];
  
  let bondingCurveAccount = await program?.account.bondingCurve.fetch(
      bondingCurvePDA, 'confirmed'
  );
  
  // console.log(`Price:`, bondingCurveAccount.virtualSolReserves.div(bondingCurveAccount.virtualTokenReserves).toNumber());
  
  return new AMM(
      BigInt(bondingCurveAccount?.virtualSolReserves.toString() || "0"  ),
      BigInt(bondingCurveAccount?.virtualTokenReserves.toString() || "0"),
      BigInt(bondingCurveAccount?.realSolReserves.toString() || "0"),
      BigInt(bondingCurveAccount?.realTokenReserves.toString() || "0"),
      BigInt(1_073_000_000_000_000n),
  );
  };
const amm = await getAmmFromBondingCurve(new PublicKey(mint));
const raydium = await Raydium.load({
  owner: wallet.publicKey,
  connection,
  cluster: 'mainnet',
  disableFeatureCheck: true,
  disableLoadToken: true,
  blockhashCommitment: 'finalized',
  // urlConfigs: {
  //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
  // },
})

const data = await raydium.api.fetchPoolById({ ids: poolState.toString() })
const poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
const baseReserve = await connection.getTokenAccountBalance(token0Vault)
const quoteReserve = await connection.getTokenAccountBalance(token1Vault)
const computeRes = await raydium.cpmm.computePairAmount({
  poolInfo,
  baseReserve: new BN(baseReserve.value.amount.toString()),
  quoteReserve: new BN(quoteReserve.value.amount.toString()),
  amount: ((tokenAmount.div(new BN(3)).div(new BN(10**9)).toString())),
  slippage: new Percent(10, 100),
  baseIn: false,
  epochInfo: await raydium.fetchEpochInfo()
})

const global_lp_token = getAssociatedTokenAddressSync(lpMint, PublicKey.findProgramAddressSync([Buffer.from("global")], new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"))[0], true)
        const ix = await program.methods
          .sell(tokenAmount, new BN(0))
        
          .accounts({
            hydra: new PublicKey("AZHP79aixRbsjwNhNeuuVsWD4Gdv1vbYQd8nWKMGZyPZ"),
            user: wallet.publicKey,
            mint: new PublicKey(mint),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"),
          })
          .instruction()
          const ix2 = await program.methods
          .sell2(new BN(computeRes.liquidity.toString()), new BN(tokenAmount.toString()))
          .remainingAccounts([
            { pubkey: ammAuthority, isWritable: false, isSigner: false },
            { pubkey: ammConfig, isWritable: false, isSigner: false },
            { pubkey: poolState, isWritable: true, isSigner: false },
            { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey, true), isWritable: true, isSigner: false },
            { pubkey: token0Vault, isWritable: true, isSigner: false },
            { pubkey: token1Vault, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: NATIVE_MINT, isWritable: false, isSigner: false },
            { pubkey: observationState, isWritable: true, isSigner: false },
            { pubkey: creatorLpToken, isWritable: true, isSigner: false },
            { pubkey: lpMint, isWritable: true, isSigner: false },
            { pubkey: ammProgramId, isWritable: false, isSigner: false },
            { pubkey: MEMO_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: ASSOCIATED_PROGRAM_ID, isWritable: false, isSigner: false },
          ])
          .accounts({
            user: wallet.publicKey,
            mint: new PublicKey(mint),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            program: new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"),
          })
          .instruction();
        const tx = new Transaction().add(ix)
        const poolStateAccountMaybe = await connection.getAccountInfo(poolState)
        if (poolStateAccountMaybe) {
          const ataAccountMaybe = await connection.getAccountInfo(getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey, true))
          if (!ataAccountMaybe) {
            tx.add(createAssociatedTokenAccountInstruction(wallet.publicKey, getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey, true), wallet.publicKey, NATIVE_MINT))
          }
         // tx.add(ix2)
        }
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        tx.feePayer = wallet.publicKey
        txs.push(tx)
        console.log(`Selling ${amountToSell} tokens of ${mint}`)
        try {
          const tradeResponse = await fetch('/api/trade', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              timestamp: Date.now(),
              mint: mint,
            }),
          })
          if (!tradeResponse.ok) {
            console.error('Error hitting /api/trade:', await tradeResponse.text())
          }
        } catch (error) {
          console.error('Error hitting /api/trade:', error)
        }
      }
      if (wallet.signAllTransactions) {
        const signed = await wallet.signAllTransactions(txs)
        for (const tx of signed) {
          const txSignature = await connection.sendRawTransaction(tx.serialize())
          console.log('Sell transaction sent:', txSignature)
         
        }
      }
    } catch (error) {
      console.error('Error selling tokens:', error)
    } finally {
      setIsSelling(false)
    }
  }

  const greekDescriptions = {
    delta: "Measures the rate of change in the option price with respect to the change in the underlying asset's price.",
    gamma: "Measures the rate of change in delta with respect to the change in the underlying asset's price.",
    theta: "Measures the rate of change in the option price with respect to time.",
    vega: "Measures the rate of change in the option price with respect to changes in the underlying asset's volatility.",
    rho: "Measures the rate of change in the option price with respect to the risk-free interest rate."
  }

  const filteredGreeks = greeks.filter(greek => 
    greek.metadata?.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    greek.mint.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatLamports = (lamports: number) => {
    return (lamports / LAMPORTS_PER_SOL).toFixed(9)
  }
  const router = useRouter();
  const handleTokenClick = (mint: string) => {
    router.push(`/${mint}`);
  };

  const MobileGreekCard = ({ greek }: { greek: Greek }) => (
    <Card className="mb-4 bg-gray-800 text-white border border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center flex-grow">
                <Avatar className="h-10 w-10 mr-3">
                  <AvatarImage src={greek.metadata?.image} alt={greek.metadata?.name} className="object-cover" />
                  <AvatarFallback className="text-lg font-bold bg-gray-700 text-white">
                    {greek.metadata?.symbol?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button
                  onClick={() => handleTokenClick(greek.mint)}
                  variant="link"
                  className="text-xl font-semibold text-white hover:underline p-0"
                >
                  {greek.metadata?.symbol || greek.mint}
                </Button>
              </div>
              <Checkbox
                checked={selectedTokens.has(greek.mint)}
                onCheckedChange={() => toggleTokenSelection(greek.mint)}
                className="h-8 w-8 border-4 border-white rounded-md checked:bg-blue-500 checked:border-blue-500"
              />
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          <Badge variant={greek.balance > 0 ? "default" : "secondary"} className="bg-gray-700 text-gray-200">
            Balance: {greek.balance?.toFixed(4) || 0}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">Total in Curve:</span>
          <span className="font-medium text-gray-200">
            {greek.solBalance ? `${greek.solBalance.toFixed(4)} SOL` : 'Loading...'}
          </span>
        </div>
      </CardContent>
      <CardContent>
        <Button 
          variant="ghost" 
          onClick={() => {
            setSelectedMint(greek.mint);
            setNewDescription(greek.metadata?.description || '');
            open();
          }} 
          className="w-full mt-2 text-gray-300 hover:text-white hover:bg-gray-700"
        >
          Update Metadata
        </Button>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-400">Last Price:</div>
          <div className="font-medium text-gray-200">{formatLamports(greek.lastPrice)} SOL</div>
          <div className="text-gray-400">Volatility:</div>
          <div className="font-medium text-gray-200">{greek.volatility?.toFixed(4) || 0}</div>
        </div>
        <Button variant="ghost" onClick={() => toggleRowExpansion(greek.mint)} className="w-full mt-2 text-gray-300 hover:text-white hover:bg-gray-700">
          {expandedRows.has(greek.mint) ? 'Hide Details' : 'Show Details'}
        </Button>
        {expandedRows.has(greek.mint) && (
          <div className="mt-2">
            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
              <div className="text-gray-400">Delta:</div>
              <div className="font-medium text-gray-200">{greek.delta?.toFixed(4)}</div>
              <div className="text-gray-400">Gamma:</div>
              <div className="font-medium text-gray-200">{greek.gamma?.toFixed(4)}</div>
              <div className="text-gray-400">Theta:</div>
              <div className="font-medium text-gray-200">{greek.theta?.toFixed(4)}</div>
              <div className="text-gray-400">Vega:</div>
              <div className="font-medium text-gray-200">{greek.vega?.toFixed(4)}</div>
              <div className="text-gray-400">Rho:</div>
              <div className="font-medium text-gray-200">{greek.rho?.toFixed(4)}</div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={greek.candles}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString()}
                    stroke="#9CA3AF"
                  />
                  <YAxis stroke="#9CA3AF" />
                  <RechartsTooltip
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    formatter={(value) => [`${formatLamports(Number(value))} SOL`, "Price"]}
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#D1D5DB' }}
                    itemStyle={{ color: '#9CA3AF' }}
                  />
                  <Line type="monotone" dataKey="close" stroke="#60A5FA" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="container mx-auto px-4 py-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-100">Financial Greeks Dashboard</h1>
      
      <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Label htmlFor="amount-percentage" className="text-gray-300">Amount:</Label>
          <div className="flex-1 sm:w-64">
            <Slider
              id="amount-percentage"
              min={0}
              max={50}
              step={1}
              value={[amountPercentage]}
              onValueChange={(value) => setAmountPercentage(value[0])}
              className="bg-gray-700"
            />
          </div>
          <span className="text-sm w-16 text-gray-300">{amountPercentage}% of balance</span>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleBuy} disabled={isBuying || selectedTokens.size === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
            Buy
          </Button>
          <Button onClick={handleSell} disabled={isSelling || selectedTokens.size === 0} variant="secondary" className="bg-red-600 hover:bg-red-700 text-white">
            Sell
          </Button>
          <Button onClick={() => fetchGreeks(true)} disabled={isLoading} variant="outline" className="bg-gray-700 hover:bg-gray-600 text-white">
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="text-sm mb-4 text-gray-300">SOL Balance: {solBalance.toFixed(9)} SOL</div>
      
      <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tokens..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 bg-gray-800 text-white border-gray-700 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="auto-refresh"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          <Label htmlFor="auto-refresh" className="text-gray-300">Auto-refresh</Label>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-800">
          <TabsTrigger value="list" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">List View</TabsTrigger>
          <TabsTrigger value="table" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Table View</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <ScrollArea className="h-[600px]">
            {filteredGreeks.map((greek, index) => (
              <MobileGreekCard key={index} greek={greek} />
            ))}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="table">
          <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px] text-gray-300">Select</TableHead>
                  <TableHead className="text-gray-300">Token</TableHead>
                  <TableHead className="text-gray-300">Balance</TableHead>
                  <TableHead className="text-gray-300">Sol in Curve</TableHead>
                  <TableHead className="cursor-pointer text-gray-300" onClick={() => sortGreeks('lastPrice')}>
                    Last Price <ArrowUpDown className="inline-block ml-1 h-4 w-4" />
                  </TableHead>
                  <TableHead className="cursor-pointer text-gray-300" onClick={() => sortGreeks('volatility')}>
                    Volatility <ArrowUpDown className="inline-block ml-1 h-4 w-4" />
                  </TableHead>
                  {Object.keys(greekDescriptions).map(greek => (
                    <TableHead key={greek} className="cursor-pointer text-gray-300" onClick={() => sortGreeks(greek as keyof Greek)}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>{greek.charAt(0).toUpperCase() + greek.slice(1)}</TooltipTrigger>
                          <TooltipContent>
                            <p>{greekDescriptions[greek as keyof typeof greekDescriptions]}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <ArrowUpDown className="inline-block ml-1 h-4 w-4" />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGreeks.map((greek, index) => (
                  <TableRow key={index} className="hover:bg-gray-700">
                    <TableCell>
                      <Checkbox
                        checked={selectedTokens.has(greek.mint)}
                        onCheckedChange={() => toggleTokenSelection(greek.mint)}
                        className="w-6 h-6 border-2 border-gray-400 rounded-md checked:bg-blue-500 checked:border-blue-500 transition-all duration-200 ease-in-out"
                      />
                    </TableCell>
                    <TableCell className="font-medium text-gray-200">
                      <div className="flex items-center">
                        <Avatar className="h-6 w-6 mr-2">
                          <AvatarImage src={greek.metadata?.image} alt={greek.metadata?.name} />
                          <AvatarFallback>{greek.metadata?.symbol?.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>{greek.metadata?.symbol || greek.mint}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-200">{greek.balance?.toFixed(4) || 0}</TableCell>
                  <TableCell className="text-gray-200">{greek.solBalance ? `${greek.solBalance.toFixed(4)} SOL` : 'Loading...'}</TableCell>
                    <TableCell className="text-gray-200">{formatLamports(greek.lastPrice)} SOL</TableCell>
                    <TableCell className="text-gray-200">{greek.volatility?.toFixed(4) || 0}</TableCell>
                    <TableCell className="text-gray-200">{greek.delta?.toFixed(4)}</TableCell>
                    <TableCell className="text-gray-200">{greek.gamma?.toFixed(4)}</TableCell>
                    <TableCell className="text-gray-200">{greek.theta?.toFixed(4)}</TableCell>
                    <TableCell className="text-gray-200">{greek.vega?.toFixed(4)}</TableCell>
                    <TableCell className="text-gray-200">{greek.rho?.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="fixed bottom-4 right-4 rounded-full p-3 bg-gray-700 text-white hover:bg-gray-600">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent className="bg-gray-800 text-white">
          <SheetHeader>
            <SheetTitle className="text-gray-100">Greek Descriptions</SheetTitle>
            <SheetDescription className="text-gray-300">
              {Object.entries(greekDescriptions).map(([greek, description]) => (
                <div key={greek} className="mb-2">
                  <strong className="text-gray-100">{greek.charAt(0).toUpperCase() + greek.slice(1)}:</strong> <span className="text-gray-300">{description}</span>
                </div>
              ))}
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet><Modal opened={opened} onClose={close} title="Update Token Metadata">
  <Textarea
    label="New Description"
    value={newDescription}
    onChange={(event) => setNewDescription(event.currentTarget.value)}
    minRows={3}
  />
  <FileInput
    label="New Image"
    placeholder="Choose file"
    accept="image/*"
onChange={(e) => {
  const file = e || null;
  setNewImage(file);
}}
mt="md"
  />
  <MantineButton onClick={handleUpdateMetadata} loading={isUpdating} fullWidth mt="xl">
    {isUpdating ? 'Updating...' : 'Update Metadata'}
  </MantineButton>
</Modal>
    </div>
  )
}