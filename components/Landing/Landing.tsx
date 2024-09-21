// @ts-nocheck
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Title, Text, Container, Grid, Group, Stack, Tabs, Modal, TextInput } from '@mantine/core';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { notifications } from '@mantine/notifications';
import axios from 'axios';
import { Image } from '@mantine/core'; // Ensure this import is present

import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Raydium, CLMM_PROGRAM_ID, ApiV3PoolInfoConcentratedItem, TxVersion } from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
// @ts-ignore
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { getATAAddress, getPdaPoolAuthority,CREATE_CPMM_POOL_PROGRAM, makeCreateAmmConfig, makeCreateCpmmPoolInInstruction, makeDepositCpmmInInstruction, makeWithdrawCpmmInInstruction } from 'tokengobbler';
import { Badge, InfoCircle } from 'tabler-icons-react';

const RayLiquidityGobbler = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lpTokens, setLpTokens] = useState<any[]>([]);
  const [clmmPositions, setClmmPositions] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [lpMints, setLpMints] = useState<string[]>([]);

  const initSdk = async () => {
    if (!wallet?.publicKey) return;
    return await Raydium.load({
      connection,
      owner: wallet.publicKey,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      blockhashCommitment: 'finalized',
    });
  };

  const fetchTokenAccountData = async () => {
    if (!publicKey) return null;
    const tokenAccountResp = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
    return tokenAccountResp.value;
  };

  const checkLpTokens = async (tokenAccounts: any) => {
    const validLpTokens: any[] = [];
    for (const account of tokenAccounts) {
      const mint = account.account.data.parsed.info.mint;
      try {
        const tokenInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
        // @ts-ignore
        if (tokenInfo && tokenInfo.value.data.parsed.info.mintAuthority === "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1") {
          validLpTokens.push({
            mint,
            balance: account.account.data.parsed.info.tokenAmount.uiAmount
          });
        }
      } catch (error) {
        console.log(`Error fetching token info for mint ${mint}:`, error);
      }
    }
    setLpTokens(validLpTokens);
  };

  const fetchPositionInfo = async () => {
    const raydium = await initSdk();
    if (!raydium) return;

    try {
      const allPosition = await raydium.clmm.getOwnerPositionInfo({ programId: CLMM_PROGRAM_ID });
      let nonZeroPosition = allPosition.filter((p: { liquidity: { isZero: () => boolean } }) => !p.liquidity.isZero());
      if (!nonZeroPosition.length) return;

      const positionPoolInfoList = (await raydium.api.fetchPoolById({
        ids: nonZeroPosition.map((p: { poolId: { toBase58: () => string } }) => p.poolId.toBase58()).join(','),
      })) as ApiV3PoolInfoConcentratedItem[];

      setClmmPositions(nonZeroPosition.map((position) => ({
        poolId: position.poolId.toBase58(),
        liquidity: position.liquidity.toString(),
        tokenFeesOwedA: position.tokenFeesOwedA.toString(),
        tokenFeesOwedB: position.tokenFeesOwedB.toString()
      })));

      const { transactions: harvestTxs } = await raydium.clmm.harvestAllRewards({
        allPoolInfo: positionPoolInfoList.reduce(
          (acc: Record<string, ApiV3PoolInfoConcentratedItem>, cur: ApiV3PoolInfoConcentratedItem) => ({
            ...acc,
            [cur.id]: cur,
          }),
          {}
        ),
        allPositions: nonZeroPosition.reduce(
          (acc: Record<string, { rewardInfos: { growthInsideLastX64: BN; rewardAmountOwed: BN; }[]; bump: number; poolId: PublicKey; liquidity: BN; nftMint: PublicKey; tickLower: number; tickUpper: number; feeGrowthInsideLastX64A: BN; feeGrowthInsideLastX64B: BN; tokenFeesOwedA: BN; tokenFeesOwedB: BN; }[]>, cur) => ({
            ...acc,
            [cur.poolId.toBase58()]: [cur],
          }),
          {}
        ),
        ownerInfo: {
          useSOLBalance: true,
        },
        programId: CLMM_PROGRAM_ID,
        txVersion: TxVersion.LEGACY
      });

      setTransactions(prev => [...prev, ...harvestTxs]);

    } catch (error) {
      console.error('Error fetching position info:', error);
    }
  };

  const processTransactions = async () => {
    if (!wallet || transactions.length === 0) return;
    setIsProcessing(true);

    try {
      for (const tx of transactions) {
        const recentBlockhash = await connection.getLatestBlockhash();
        tx.recentBlockhash = recentBlockhash.blockhash;
        tx.feePayer = wallet.publicKey;
        const signedTx = await wallet.signTransaction(tx);
        await connection.sendRawTransaction(signedTx.serialize());
      }

      notifications.show({
        title: 'Success',
        message: 'All transactions processed successfully',
        color: 'green',
      });
    } catch (error) {
      console.error('Error processing transactions:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to process transactions',
        color: 'red',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!publicKey) return;
      const tokenAccountData = await fetchTokenAccountData();
      if (tokenAccountData) {
        await checkLpTokens(tokenAccountData);
      }
      await fetchPositionInfo();
    };

    fetchData();
  }, [publicKey]);

  return (
    <Stack>
      <Title order={3}>Ray Liquidity Gobbler</Title>
      <WalletMultiButton />
      {publicKey ? (
        <>
          <Button onClick={processTransactions} disabled={isProcessing || transactions.length === 0}>
            {isProcessing ? 'Processing...' : 'Process Transactions'}
          </Button>
          <Text>LP Tokens:</Text>
          {lpTokens.map((token, index) => (
            <Text key={index}>{token.mint}: {token.balance}</Text>
          ))}
          <Text>CLMM Positions:</Text>
          {clmmPositions.map((position, index) => (
            <Text key={index}>Pool {position.poolId}: {position.liquidity} liquidity</Text>
          ))}
        </>
      ) : (
        <Text>Please connect your wallet to use the Ray Liquidity Gobbler</Text>
      )}
    </Stack>
  );
};

export default function Landing() {
  const [activeTab, setActiveTab] = useState<string | null>('charts');
  const [poolIds, setPoolIds] = useState<string[]>([]);
  const [poolData, setPoolData] = useState<{[key: string]: any}>({});
  const [klineData, setKlineData] = useState<{[key: string]: any}>({});
  const [quoteMints, setQuoteMints] = useState<string[]>([]);
  const [baseMints, setBaseMints] = useState<string[]>([]);
  const [lpMints, setLpMints] = useState<string[]>([]);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [totalSupplies, setTotalSupplies] = useState<{ [key: string]: number }>({});

  const { connection } = useConnection();
  useEffect(() => {
    const fetchTotalSupplies = async () => {
      if (!connection || lpMints.length === 0) return;

      const supplies: { [key: string]: number } = {};

      for (const mint of lpMints) {
        try {
          const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
          if (mintInfo.value) {
            // @ts-ignore
            const totalSupply = mintInfo.value.data.parsed.info.supply;
            supplies[mint] = parseInt(totalSupply);
          }
        } catch (error) {
          console.error(`Error fetching total supply for mint ${mint}:`, error);
        }
      }

      setTotalSupplies(supplies);
    };

    fetchTotalSupplies();
  }, [connection, lpMints]);

  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [pools, setPools] = useState<{ [key: string]: { 
    id: string; 
    mintA: { 
      address: string; 
      programId: string 
    }; 
    mintB: { 
      address: string; 
      programId: string 
    }; 
    lpMint: { 
      address: string;
      metadata?: {
        mimeType?: string;
        name: string;
        symbol: string;
        image: string;
        description: string;
      };
    };
    programId: string;
  }}>({});
  useEffect(() => {
    axios.get('/api/gpa/?poolIds=')
      .then((response: any) => {
        const ids = response.data.map((pool: any) => pool.id);
        setPoolIds(ids);
        console.log(ids);
        const newQuoteMints: string[] = [];
        const newBaseMints: string[] = [];
        const newLpMints: string[] = [];

        ids.forEach((id: string) => {
          const pool = response.data.find((p: any) => p.id === id);
          if (pool) {
            newQuoteMints.push(pool.mintA.address);
            newBaseMints.push(pool.mintB.address);
            newLpMints.push(pool.lpMint.address);
            // Fetch metadata for lpMint
            if (pool.lpMint && pool.lpMint.address) {
              const metadataPDA = PublicKey.findProgramAddressSync(
                [
                  Buffer.from('metadata'),
                  new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
                  new PublicKey(pool.lpMint.address).toBuffer(),
                ],
                new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
              )[0];
              connection.getAccountInfo(metadataPDA).then(async (metadataInfo) => {
                if (metadataInfo) {
                  const metadataData = metadataInfo.data;
                  let [name, symbol, uri] = [
                    metadataData.slice(1, 33),
                    metadataData.slice(33, 65),
                    metadataData.slice(65, -1)
                  ].map((data) => new TextDecoder().decode(data).replace(/\0/g, ''));
                  const findLastHttp = (str: string): string => {
                    const lastIndex = str.lastIndexOf('http');
                    if (lastIndex !== -1) {
                      return str.substring(lastIndex).replace(/[^\x20-\x7E]/g, '');
                    } else {
                      return findLastHttp(str.substring(0, str.length - 1));
                    }
                  };
                  
                  if (uri.includes('http')) {
                    uri = findLastHttp(uri);
                  } else {
                    console.log(uri);
                  }
                  if (uri) {
                    try {
                      const response = await fetch("https://gobbler.fun/cors/"+uri);
                      const text = await response.text();
                      let json;
                      try {
                        // Use a more lenient JSON parsing method
                        json = JSON.parse(text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
                      } catch (parseError) {
                        console.error(`Error parsing JSON for LP token ${pool.id}:`, parseError);
                        console.log('Raw response:', text);
                        // Attempt to manually fix common JSON errors
                        const fixedText = text
                          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ensure all keys are double-quoted
                          .replace(/'/g, '"') // Replace single quotes with double quotes
                          .replace(/,\s*}/g, '}') // Remove trailing commas in objects
                          .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
                        try {
                          json = JSON.parse(fixedText);
                        } catch (secondParseError) {
                          console.error(`Failed to parse JSON even after attempting fixes for LP token ${pool.id}:`, secondParseError);
                          return;
                        }
                      }
                      if (json.image) {
                        const imageResponse = await fetch(json.image);
                        const imageBlob = await imageResponse.blob();
                        const mimeType = imageBlob.type || 'image/';
                        json = {
                          ...json.metadata,
                          image: "https://gobbler.fun/cors/"+json.image,
                          mimeType: mimeType
                        };
                        console.log(`Image MIME type for LP token ${pool.id}: ${mimeType}`);
                      } else {
                        console.warn(`No image data found for LP token ${pool.id}`);
                      }
                      console.log(`Metadata for LP token ${pool.id}:`, json);
                      setPools(prev => ({
                        ...prev,
                        [pool.id]: {
                          ...prev[pool.id],
                          lpMint: {
                            ...prev[pool.id].lpMint,
                            metadata: json
                          }
                        }
                      }));
                    } catch (error) {
                      console.error(`Error fetching metadata URI for LP token ${pool.id}:`, error);
                    }
                  }
                }
              }).catch((error) => {
                console.error(`Error fetching metadata for LP token ${pool.id}:`, error);
              });
            }
            setPools(prev => ({...prev, [pool.id]: pool}));
          }
        });

        setQuoteMints(newQuoteMints);
        setBaseMints(newBaseMints);
        setLpMints(newLpMints);

        ids.forEach((id: string) => {
          const socket = new WebSocket(`wss://stake.fomo3d.fun/ws/${id}`);

          socket.onopen = () => {
            const ohlcvMessage = {
              type: 'ohlcv',
              startTime: Math.floor((Date.now() - 24 * 60 * 60 * 1000 * 7) / 1000),
              stopTime: Math.floor(Date.now() / 1000),
            };
            socket.send(JSON.stringify(ohlcvMessage));
          };

          socket.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data as string);
            console.log('data', data);
            setPoolData(prevData => ({...prevData, [id]: data}));
          };

          socket.onerror = (error: Event) => console.error(`WebSocket error for ${id}:`, error);

          return () => {
            socket.close();
          };
        });
      })
      .catch(error => console.error('Error fetching pool IDs:', error));
  }, []);

  useEffect(() => {
    const processedData = processKlineData(poolData);
    setKlineData(processedData);
  }, [poolData]);

  const processKlineData = (poolData: {[key: string]: any[]}) => {
    const processedData: {[key: string]: any[]} = {};

    Object.entries(poolData).forEach(([id, data]) => {
      if (data.length === 0) return;

      data.sort((a, b) => a.timestamp - b.timestamp);

      const interval = 60;
      let currentGroup: any[] = [];
      let currentGroupStart = Math.floor(data[0].timestamp / interval) * interval;

      const klineData: any[] = [];

      data.forEach((item) => {
        if (item.timestamp >= currentGroupStart + interval) {
          if (currentGroup.length > 0) {
            const kline = {
              time: currentGroupStart * 1000,
              open: currentGroup[0].buy_price,
              high: Math.max(...currentGroup.map(d => d.buy_price)),
              low: Math.min(...currentGroup.map(d => d.buy_price)),
              close: currentGroup[currentGroup.length - 1].buy_price,
              volume: currentGroup.length,
            };
            klineData.push(kline);
          }
          currentGroup = [];
          currentGroupStart = Math.floor(item.timestamp / interval) * interval;
        }
        currentGroup.push(item);
      });

      if (currentGroup.length > 0) {
        const kline = {
          time: currentGroupStart * 1000,
          open: currentGroup[0].buy_price,
          high: Math.max(...currentGroup.map(d => d.buy_price)),
          low: Math.min(...currentGroup.map(d => d.buy_price)),
          close: currentGroup[currentGroup.length - 1].buy_price,
          volume: currentGroup.length,
        };
        klineData.push(kline);
      }

      processedData[id] = klineData;
    });

    return processedData;
  };

  const handleDeposit = async () => {
    if (!wallet || !publicKey || !selectedPoolId) return;

    try {
      const poolKeys = await getCpmmPoolKeys(selectedPoolId);
      console.log(poolKeys)
console.log(
  CREATE_CPMM_POOL_PROGRAM,
  publicKey,
  getPdaPoolAuthority(CREATE_CPMM_POOL_PROGRAM).publicKey,
  selectedPoolId,
  await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].lpMint.address)).publicKey,
  await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].mintA.address)).publicKey,
  await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].mintB.address)).publicKey,
  await getATAAddress(new PublicKey(pools[selectedPoolId].id), new PublicKey(pools[selectedPoolId].mintA.address)).publicKey,
  await getATAAddress(new PublicKey(pools[selectedPoolId].id), new PublicKey(pools[selectedPoolId].mintB.address)).publicKey,
  new PublicKey(pools[selectedPoolId].mintA.address),
  new PublicKey(pools[selectedPoolId].mintB.address),
  new PublicKey(pools[selectedPoolId].lpMint.address),
  new BN(depositAmount),
  new BN(0),
  new BN(0),
  new PublicKey(pools[selectedPoolId].mintA.programId),
  new PublicKey(pools[selectedPoolId].mintB.programId)
);

      const depositInstruction = makeDepositCpmmInInstruction(

        CREATE_CPMM_POOL_PROGRAM,
        publicKey,
        getPdaPoolAuthority(CREATE_CPMM_POOL_PROGRAM).publicKey,
        new PublicKey(selectedPoolId),
        await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].lpMint.address)).publicKey,
        await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].mintA.address)).publicKey,
        await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].mintB.address)).publicKey,
        await getATAAddress(new PublicKey(pools[selectedPoolId].id), new PublicKey(pools[selectedPoolId].mintA.address)).publicKey,
        await getATAAddress(new PublicKey(pools[selectedPoolId].id), new PublicKey(pools[selectedPoolId].mintB.address)).publicKey,
        new PublicKey(pools[selectedPoolId].mintA.address),
        new PublicKey(pools[selectedPoolId].mintB.address),
        new PublicKey(pools[selectedPoolId].lpMint.address),
        new BN(depositAmount),
        new BN(0),
        new BN(0),
        new PublicKey(pools[selectedPoolId].mintA.programId),
        new PublicKey(pools[selectedPoolId].mintB.programId)
            );

      const transaction = new Transaction().add(depositInstruction);
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await wallet.signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signedTx.serialize());

      notifications.show({
        title: 'Success',
        message: `Deposit transaction sent: ${txid}`,
        color: 'green',
      });

      setIsDepositModalOpen(false);
      setDepositAmount('');
    } catch (error) {
      console.error('Error depositing:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to deposit. Please try again.',
        color: 'red',
      });
    }
  };

  const handleWithdraw = async () => {
    if (!wallet || !publicKey || !selectedPoolId) return;

    try {
      const poolKeys = await getCpmmPoolKeys(selectedPoolId);
      const poolInfo = await getPoolInfoFromRpc(selectedPoolId);
      const withdrawInstruction = makeWithdrawCpmmInInstruction(
        CREATE_CPMM_POOL_PROGRAM,
        publicKey,
        getPdaPoolAuthority(CREATE_CPMM_POOL_PROGRAM).publicKey,
        new PublicKey(selectedPoolId),
        await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].lpMint.address)).publicKey,
        await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].mintA.address)).publicKey,
        await getATAAddress(publicKey, new PublicKey(pools[selectedPoolId].mintB.address)).publicKey,
        await getATAAddress(new PublicKey(selectedPoolId), new PublicKey(pools[selectedPoolId].mintA.address)).publicKey,
        await getATAAddress(new PublicKey(selectedPoolId), new PublicKey(pools[selectedPoolId].mintB.address)).publicKey,
        new PublicKey(pools[selectedPoolId].mintA.address),
        new PublicKey(pools[selectedPoolId].mintB.address),
        new PublicKey(pools[selectedPoolId].lpMint.address),
        new BN(withdrawAmount),
        new BN(0),
        new BN(0),
        new PublicKey(pools[selectedPoolId].mintA.programId),
        new PublicKey(pools[selectedPoolId].mintB.programId)
      );

      const transaction = new Transaction().add(withdrawInstruction);
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await wallet.signTransaction(transaction);
      const txid = await connection.sendRawTransaction(signedTx.serialize());

      notifications.show({
        title: 'Success',
        message: `Withdraw transaction sent: ${txid}`,
        color: 'green',
      });

      setIsWithdrawModalOpen(false);
      setWithdrawAmount('');
    } catch (error) {
      console.error('Error withdrawing:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to withdraw. Please try again.',
        color: 'red',
      });
    }
  };

  const getCpmmPoolKeys = async (poolId: string) => {
    // Implement this function to fetch pool keys
    // This is a placeholder implementation
    return {
      authority: '',
      vault: { A: '', B: '' },
    };
  };

  const getPoolInfoFromRpc = async (poolId: string) => {
    // Implement this function to fetch pool info
    // This is a placeholder implementation
    return {
      poolInfo: {
        programId: '',
        id: '',
        mintA: { address: '', programId: '' },
        mintB: { address: '', programId: '' },
        lpMint: { address: '' },
      },
    };
  };

  return (
    <Container fluid style={{ backgroundColor: 'black', color: '#39FF14', minHeight: '100vh', padding: '2rem' }}>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="charts">Charts</Tabs.Tab>
          <Tabs.Tab value="rayLiquidityGobbler">Ray Liquidity Gobbler</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="charts">
          <Grid>
            {poolIds.map((poolId, index) => (
              <Grid.Col key={poolId} span={{ base: 12, md: 6, lg: 4 }}>
                <Card style={{ backgroundColor: 'black', borderColor: '#39FF14', borderWidth: 2 }}>
                  <Card.Section>
                    <Group align="center" grow>
                      {pools[poolId]?.lpMint?.metadata ? (
                        <Card style={{ backgroundColor: 'black', borderColor: '#39FF14', borderWidth: 1 }}>
                          <Card.Section>
                            {pools[poolId].lpMint.metadata.mimeType?.indexOf('video/') !== -1 ? (
                              <video
                                src={pools[poolId].lpMint.metadata.image}
                                height={160}
                                width="100%"
                                style={{ objectFit: 'contain' }}
                                controls
                              />
                            ) : pools[poolId].lpMint.metadata.mimeType?.indexOf('audio/') !== -1 ? (
                              <audio
                                src={pools[poolId].lpMint.metadata.image}
                                controls
                                style={{ width: '100%', marginTop: '20px' }}
                              />
                            ) : (
                              <Image
                                src={pools[poolId].lpMint.metadata.image}
                                height={160}
                                width="100%"
                                fit="contain"
                                alt={pools[poolId].lpMint.metadata.name}
                              />
                            )}
                          </Card.Section>
                          <Group align="apart" mt="md" mb="xs"> 
                          <Text style={{ fontWeight: 500, color: '#39FF14' }} lineClamp={1}>{pools[poolId].lpMint.metadata.name}</Text>
                          <Badge color="pink">  
                             {pools[poolId].lpMint.metadata.symbol}
                          </Badge>
                          </Group>
                          <Text size="sm" style={{ color: '#39FF14' }} lineClamp={2}>
                            {pools[poolId].lpMint.metadata.description}
                          </Text>
                          <Group mt="md">
                            <Button 
                              variant="outline" 
                              color="red" 
                              size="xs"
                              onClick={() => {
                                setSelectedPoolId(poolId);
                                setIsWithdrawModalOpen(true);
                              }}
                            >
                              Withdraw
                            </Button>
                            <Button 
                              variant="outline" 
                              color="green" 
                              size="xs"
                              onClick={() => {
                                setSelectedPoolId(poolId);
                                setIsDepositModalOpen(true);
                              }}
                            >
                              Add Liquidity
                            </Button>
                          </Group>
                        </Card>
                      ) : (
                        <Title order={4} style={{ color: '#39FF14' }}>{pools[poolId]?.lpMint?.address}</Title>
                      )}
                    </Group>
                  </Card.Section>
                  <Card.Section p="md">
                    <div style={{ height: '300px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={klineData[poolId] || []}>
                          <Line 
                            type="monotone" 
                            dataKey="close" 
                            stroke="#39FF14" 
                            strokeWidth={2} 
                            dot={false} 
                          />
                          <XAxis 
                            dataKey="time" 
                            stroke="#39FF14"
                            tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                          />
                          <YAxis 
                            stroke="#39FF14"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(value) => value.toFixed(8)}
                          />
                          <RechartsTooltip 
                            contentStyle={{ 
                              background: 'black', 
                              border: '2px solid #39FF14',
                              borderRadius: '4px',
                              color: '#39FF14'
                            }}
                            formatter={(value) => typeof value === 'number' ? value.toFixed(8) : value}
                            labelFormatter={(label) => new Date(label).toLocaleString()}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card.Section>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="rayLiquidityGobbler">
          <RayLiquidityGobbler />
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        title="Deposit"
        styles={{
          title: { color: '#39FF14' },
          body: { backgroundColor: 'black', color: '#39FF14' },
        }}
      >
        <TextInput
          label="Amount to Deposit"
          value={depositAmount}
          onChange={(event) => setDepositAmount(event.currentTarget.value)}
          placeholder="Enter amount"
        />
        {selectedPoolId && totalSupplies[pools[selectedPoolId].lpMint.address] && (
          <Text mt="sm" color="#39FF14">
            Total Supply: {totalSupplies[pools[selectedPoolId].lpMint.address].toLocaleString()}
          </Text>
        )}
        <Button onClick={handleDeposit} fullWidth mt="md">
          Confirm Deposit
        </Button>
      </Modal>

      <Modal
        opened={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        title="Withdraw"
        styles={{
          title: { color: '#39FF14' },
          body: { backgroundColor: 'black', color: '#39FF14' },
        }}
      >
        <TextInput
          label="Amount to Withdraw"
          value={withdrawAmount}
          onChange={(event) => setWithdrawAmount(event.currentTarget.value)}
          placeholder="Enter amount"
        />

{selectedPoolId && totalSupplies[pools[selectedPoolId].lpMint.address] && (
          <Text mt="sm" color="#39FF14">
            Total Supply: {totalSupplies[pools[selectedPoolId].lpMint.address].toLocaleString()}
          </Text>
        )}
        <Button onClick={handleWithdraw} fullWidth mt="md">
          Confirm Withdraw
        </Button>
      </Modal>
    </Container>
  );
}