'use client'

import { useState, useCallback, useEffect } from 'react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import BN from 'bn.js'
import { CurveLaunchpad } from "../../../components/types/curve_launchpad"
import * as IDL from "../../../components/types/curve_launchpad.json"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useParams } from 'next/navigation'
import { Box, Button, Group, NumberInput, Paper, Title, Text } from '@mantine/core'
import TradingViewChart from '../../../components/TradingViewChart'
import { AMM } from '../../../utils/amm'

export default function MintPage() {
  const params = useParams()
  const mintAddress = params?.mintAddress as string
  const [candlestickData, setCandlestickData] = useState([])
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const [amount, setAmount] = useState('')
  const [isBuying, setIsBuying] = useState(false)
  const [isSelling, setIsSelling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buyPrice, setBuyPrice] = useState<number | null>(null)
  const [sellPrice, setSellPrice] = useState<number | null>(null)
  
  const program = wallet ? new Program<CurveLaunchpad>(IDL as any, new AnchorProvider(connection, wallet, {})) : null

  const handleBuy = useCallback(async () => {
    if (!program || !wallet || !mintAddress) return
    setIsBuying(true)
    try {
      const tokenAmount = new BN(parseFloat(amount) * 1e6) // Assuming 9 decimals
      const maxSolAmount = new BN(Number.MAX_SAFE_INTEGER)
      const ix = await program.methods
        .buy(tokenAmount, maxSolAmount)
        .accounts({
          user: wallet.publicKey,
          mint: new PublicKey(mintAddress),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          program: new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"),
        })
        .instruction()
        const ixs: any = []
        const ata = await getAssociatedTokenAddressSync( new PublicKey(mintAddress), wallet.publicKey, true, TOKEN_2022_PROGRAM_ID)
        const ataAccountMAybe = await connection.getAccountInfo(ata)
        if (ataAccountMAybe) {
          ixs.push(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey,
              ata,
              wallet.publicKey,
              new PublicKey(mintAddress),
              TOKEN_2022_PROGRAM_ID
            )
          )
        }
        ixs.push(ix)
      const tx = new Transaction().add(...ixs)
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      const signed = await wallet.signTransaction(tx)
      const txSignature = await connection.sendRawTransaction(signed.serialize())
      try {
        const tradeResponse = await fetch('/api/trade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            mint: mintAddress,
          }),
        });
        
        if (!tradeResponse.ok) {
          console.error('Error hitting /api/trade:', await tradeResponse.text());
          throw new Error('Failed to hit /api/trade');
        }
      } catch (error) {
        console.error('Error hitting /api/trade:', error);
        setError('Failed to initiate trade. Please try again.');
        setIsBuying(false);
        return;
      }
      console.log('Buy transaction:', txSignature)
    } catch (error) {
      console.error('Error buying token:', error)
      setError('Failed to buy token. Please try again.')
    } finally {
      setIsBuying(false)
    }
  }, [program, wallet, connection, mintAddress, amount])
  useEffect(() => {
    const fetchTradeData = async () => {
      if (!mintAddress) return;
      try {
        const tradeResponse = await fetch('/api/trade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            mint: mintAddress,
          }),
        });
        
        if (!tradeResponse.ok) {
          console.error('Error hitting /api/trade:', await tradeResponse.text());
          throw new Error('Failed to hit /api/trade');
        }
        console.log('Trade data fetched successfully');
      } catch (error) {
        console.error('Error fetching trade data:', error);
        setError('Failed to fetch trade data. Please try again.');
      }
    };

    fetchTradeData();
  }, [mintAddress]);
  const [tokenMetadata, setTokenMetadata] = useState<any>(null);
  useEffect(() => {
    const fetchTokenMetadata = async () => {
      if (!mintAddress) return;

      const url = `https://mainnet.helius-rpc.com/?api-key=0d4b4fd6-c2fc-4f55-b615-a23bab1ffc85`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'my-id',
            method: 'getAsset',
            params: {
              id: mintAddress,
            },
          }),
        });

        const { result } = await response.json();
        console.log("Asset Data: ", result);
        
        if (result) {
          setTokenMetadata({
            name: result.content.metadata.name,
            symbol: result.content.metadata.symbol,
            description: result.content.metadata.description,
            image: result.content.links.image,
            decimals: result.token_info.decimals,
            supply: result.token_info.supply,
          });
        } else {
          console.log('No asset metadata found');
        }
      } catch (error) {
        console.error('Error fetching asset:', error);
      }
    };

    fetchTokenMetadata();
  }, [mintAddress]);

  const handleSell = useCallback(async () => {
    if (!program || !wallet || !mintAddress) return
    setIsSelling(true)
    try {
      const tokenAmount = new BN(parseFloat(amount) * 1e9) // Assuming 9 decimals
      const minSolAmount = new BN(0)
      const ix = await program.methods
        .sell(tokenAmount, minSolAmount)
        .accounts({
          user: wallet.publicKey,
          mint: new PublicKey(mintAddress),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          program: new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"),
        })
        .instruction()
      const tx = new Transaction().add(ix)
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      tx.feePayer = wallet.publicKey
      const signed = await wallet.signTransaction(tx)
      const txSignature = await connection.sendRawTransaction(signed.serialize())
      console.log('Sell transaction:', txSignature)
      try {
        const tradeResponse = await fetch('/api/trade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timestamp: Date.now(),
            mint: mintAddress,
          }),
        });
        
        if (!tradeResponse.ok) {
          console.error('Error hitting /api/trade:', await tradeResponse.text());
          throw new Error('Failed to hit /api/trade');
        }
      } catch (error) {
        console.error('Error hitting /api/trade:', error);
        setError('Failed to initiate trade. Please try again.');
        setIsBuying(false);
        return;
      }
    } catch (error) {
      console.error('Error selling token:', error)
      setError('Failed to sell token. Please try again.')
    } finally {
      setIsSelling(false)
    }
  }, [program, wallet, connection, mintAddress, amount])
  const [bondingCurveData, setBondingCurveData] = useState<Buffer | null>(null)
  const [timeframe, setTimeframe] = useState('1m')

  const fetchCandlestickData = async () => {
    if (!mintAddress) return
    try {
      const response = await fetch(`/api/candlesticks?mint=${mintAddress}&timeframe=${timeframe}`)
      if (!response.ok) {
        throw new Error('Failed to fetch candlestick data')
      }
      const data = await response.json()
      if (data.length === 0) {
        setError('No data available for the selected timeframe')
      } else {
        setCandlestickData(data)
      }
    } catch (error) {
      console.error('Error fetching candlestick data:', error)
      setError('Failed to fetch chart data. Please try again later.')
    } finally {
    }
  }
  useEffect(() => {
    fetchCandlestickData()
    const interval = setInterval(fetchCandlestickData, 600);
    return () => clearInterval(interval);
  }, [mintAddress, timeframe, bondingCurveData])
  useEffect(() => {
    const fetchPrices = async () => {
      if (!mintAddress) return
      try {
          const bondingCurve = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(mintAddress).toBuffer()], new PublicKey("65YAWs68bmR2RpQrs2zyRNTum2NRrdWzUfUTew9kydN9"))
          const accountData = (await connection.getAccountInfo((bondingCurve[0])))?.data
          const bondingCurveData = accountData?.slice(8)
          setBondingCurveData(bondingCurveData as Buffer)
        if (bondingCurveData) {
          const virtualSolReserves = bondingCurveData.readBigUInt64LE(0)
          const virtualTokenReserves = bondingCurveData.readBigUInt64LE(8)
          const realSolReserves = bondingCurveData.readBigUInt64LE(16)
          const realTokenReserves = bondingCurveData.readBigUInt64LE(24)

          const amm = new AMM(
            BigInt(virtualSolReserves),
            BigInt(virtualTokenReserves),
            BigInt(realSolReserves),
            BigInt(realTokenReserves),
            BigInt(1000000000000000)
          )

          const buyPrice = Number(amm.getBuyPrice(BigInt(Number(amount) * 1e6)))
          const sellPrice = Number(amm.getSellPrice(BigInt(Number(amount) * 1e6)))
          
          setBuyPrice(buyPrice / 1e9)
          if (sellPrice > 0) {
            setSellPrice(sellPrice / 1e9)
          }
          else {
            setSellPrice(0)
          }
        }
      } catch (error) {
        console.error('Error fetching prices:', error)
        setError('Failed to fetch token prices.')
      } finally {
      }
    }

    fetchPrices()
  }, [connection, mintAddress, amount, timeframe])

  if (isLoading || candlestickData.length === 0) {
    return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading token data...</div>
  }

  if (!mintAddress) {
    return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Invalid token address</div>
  }

  return (
    <Box className="min-h-screen bg-gray-900 text-white p-8">
      <Title order={1} className="text-4xl font-bold mb-8 text-center text-green-400">Token Details</Title>
      {error && <Text color="red">{error}</Text>}
      {tokenMetadata && (
        <Box className="mb-8">
          <Text>Name: {tokenMetadata.name}</Text>
          <Text>Symbol: {tokenMetadata.symbol}</Text>
          <Text>Decimals: {tokenMetadata.decimals}</Text>
          <Text>Supply: {tokenMetadata.supply}</Text>
          <img src={tokenMetadata.image} alt={tokenMetadata.name} />
          <Text>{tokenMetadata.description}</Text>
        </Box>
      )}
      <Paper className="max-w-4xl mx-auto bg-gray-800 p-8 rounded-lg shadow-lg">
        <Box className="mb-8">
          <NumberInput
            value={amount}
            onChange={(value) => setAmount(value.toString())}
            placeholder="Amount"
            className="w-full"
            styles={(theme) => ({
              input: {
                backgroundColor: theme.colors.gray[7],
                color: theme.white,
                border: `1px solid ${theme.colors.gray[6]}`,
                '&:focus': {
                  borderColor: theme.colors.green[5],
                },
              },
            })}
          />
        </Box>
        <Group gap="md" grow className="mb-8">
          <Button
            onClick={handleBuy}
            disabled={isBuying}
            color="green"
            className="font-semibold"
          >
            {isBuying ? 'Buying...' : 'Buy'}
          </Button>
          <Button
            onClick={handleSell}
            disabled={isSelling}
            color="red"
            className="font-semibold"
          >
            {isSelling ? 'Selling...' : 'Sell'}
          </Button>
        </Group>
        <Box className="mb-4">
          <Text>Buy Price: {buyPrice !== null ? buyPrice.toFixed(6) : 'Loading...'}</Text>
          <Text>Sell Price: {sellPrice !== null ? sellPrice.toFixed(6) : 'Loading...'}</Text>
        </Box>
       
        {candlestickData.length > 0 && (
        <Box className="h-[500px] w-full mb-8">
          <TradingViewChart symbol={`SOLANA:${mintAddress}/USD`} theme="dark" mintAddress={mintAddress} candlestickData={candlestickData} />
        </Box>
        )}
        <Group gap="md" grow className="mb-4">
          <Button
            onClick={() => setTimeframe('1s')}
            color={timeframe === '1s' ? 'green' : 'gray'}
            className="font-semibold"
          >
            1S
          </Button>
          <Button
            onClick={() => setTimeframe('1m')}
            color={timeframe === '1m' ? 'green' : 'gray'}
            className="font-semibold"
          >
            1M
          </Button>
          <Button
            onClick={() => setTimeframe('5m')}
            color={timeframe === '5m' ? 'green' : 'gray'}
            className="font-semibold"
          >
            5M
          </Button>
          <Button
            onClick={() => setTimeframe('15m')}
            color={timeframe === '15m' ? 'green' : 'gray'}
            className="font-semibold"
          >
            15M
          </Button>
          <Button
            onClick={() => setTimeframe('1h')}
            color={timeframe === '1h' ? 'green' : 'gray'}
            className="font-semibold"
          >
            1H
          </Button>
          <Button
            onClick={() => setTimeframe('4h')}
            color={timeframe === '4h' ? 'green' : 'gray'}
            className="font-semibold"
          >
            4H
          </Button>
          <Button
            onClick={() => setTimeframe('1d')}
            color={timeframe === '1d' ? 'green' : 'gray'}
            className="font-semibold"
          >
            1D
          </Button>
        </Group>
      </Paper> <Box className="mb-4">
          <Text className="font-semibold text-yellow-400">Gobbler Fee Distribution</Text>
          <Text>When you buy tokens, you have a chance to receive all transaction fees!</Text>
          <Text>The more you buy, the higher your chances of winning fees.</Text>
        </Box>
        <Box className="mb-4">
          <Text className="font-semibold text-purple-400">Dynamic Fee Structure</Text>
          <Text>Fees may vary based on market conditions and user activity.</Text>
          <Text>Stay active to potentially benefit from lower fees!</Text>
        </Box>
    </Box>
  )
}