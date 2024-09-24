'use client';

import React, { useState, useEffect } from 'react'
import { Button, Card, TextInput, Stack, Title, Container, Group, Text } from '@mantine/core'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import axios from 'axios'
import { PublicKey } from '@solana/web3.js'
// @ts-ignore
import { BN } from 'bn.js'
import Decimal from 'decimal.js'
import { makeDepositCpmmInInstruction, makeWithdrawCpmmInInstruction, makeSwapCpmmBaseInInInstruction } from '../../../components/types/instruction'
import { getATAAddress, getPdaPoolAuthority, getPdaLpMint, getPdaVault } from '../../../components/types/pda'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export default function ExplorerPage({ params }: { params: { mint: string } }) {
  const { mint } = params;
  const [poolInfo, setPoolInfo] = useState<any>(null);
  const [klineData, setKlineData] = useState<any[]>([]);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPoolInfo = async () => {
      try {
        const response = await axios.get(`/api/gpa/?poolIds=${mint}`);
        setPoolInfo(response.data[0]);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching pool info:', error);
        setIsLoading(false);
      }
    };

    const setupWebSocket = () => {
      const socket = new WebSocket(`wss://stake.fomo3d.fun/ws/${mint}`);

      socket.onopen = () => {
        const ohlcvMessage = {
          type: 'ohlcv',
          startTime: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000),
          stopTime: Math.floor(Date.now() / 1000),
        };
        socket.send(JSON.stringify(ohlcvMessage));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const processedData = processKlineData(data);
        setKlineData(processedData);
      };

      socket.onerror = (error) => console.error(`WebSocket error:`, error);

      return () => socket.close();
    };

    fetchPoolInfo();
    const cleanup = setupWebSocket();

    return cleanup;
  }, [mint]);

  const handleDeposit = async () => {
    if (!poolInfo) return;

    try {
      const depositIx = makeDepositCpmmInInstruction(
        new PublicKey(poolInfo.programId),
        new PublicKey(poolInfo.owner), // Replace with actual owner public key
        getPdaPoolAuthority(new PublicKey(poolInfo.programId)).publicKey,
        new PublicKey(poolInfo.id),
        (await getATAAddress(new PublicKey(poolInfo.owner), getPdaLpMint(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey)).publicKey,
        (await getATAAddress(new PublicKey(poolInfo.owner), new PublicKey(poolInfo.mintA.address))).publicKey,
        (await getATAAddress(new PublicKey(poolInfo.owner), new PublicKey(poolInfo.mintB.address))).publicKey,
        getPdaVault(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), new PublicKey(poolInfo.mintA.address)).publicKey,
        getPdaVault(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), new PublicKey(poolInfo.mintB.address)).publicKey,
        new PublicKey(poolInfo.mintA.address),
        new PublicKey(poolInfo.mintB.address),
        getPdaLpMint(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,
        new BN(new Decimal(inputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)),
        new BN(new Decimal(outputAmount).mul(10 ** poolInfo.mintB.decimals).toFixed(0)),
        new BN(new Decimal(inputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)),
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID
      );

      // Here you would add the instruction to a transaction and send it
      console.log('Deposit instruction created:', depositIx);
    } catch (error) {
      console.error('Error creating deposit instruction:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!poolInfo) return;

    try {
      const withdrawIx = makeWithdrawCpmmInInstruction(
        new PublicKey(poolInfo.programId),
        new PublicKey(poolInfo.owner), // Replace with actual owner public key
        getPdaPoolAuthority(new PublicKey(poolInfo.programId)).publicKey,
        new PublicKey(poolInfo.id),
        (await getATAAddress(new PublicKey(poolInfo.owner), getPdaLpMint(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey)).publicKey,
        (await getATAAddress(new PublicKey(poolInfo.owner), new PublicKey(poolInfo.mintA.address))).publicKey,
        (await getATAAddress(new PublicKey(poolInfo.owner), new PublicKey(poolInfo.mintB.address))).publicKey,
        getPdaVault(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), new PublicKey(poolInfo.mintA.address)).publicKey,
        getPdaVault(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), new PublicKey(poolInfo.mintB.address)).publicKey,
        new PublicKey(poolInfo.mintA.address),
        new PublicKey(poolInfo.mintB.address),
        getPdaLpMint(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,
        new BN(new Decimal(inputAmount).mul(10 ** poolInfo.lpMint.decimals).toFixed(0)),
        new BN(new Decimal(outputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)),
        new BN(new Decimal(outputAmount).mul(10 ** poolInfo.mintB.decimals).toFixed(0)),
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID
      );

      // Here you would add the instruction to a transaction and send it
      console.log('Withdraw instruction created:', withdrawIx);
    } catch (error) {
      console.error('Error creating withdraw instruction:', error);
    }
  };

  const handleSwap = async () => {
    if (!poolInfo) return;

    try {
      const swapIx = makeSwapCpmmBaseInInInstruction(
        new PublicKey(poolInfo.programId),
        new PublicKey(poolInfo.owner), // Replace with actual owner public key
        getPdaPoolAuthority(new PublicKey(poolInfo.programId)).publicKey,
        new PublicKey(poolInfo.config.id),
        new PublicKey(poolInfo.id),
        (await getATAAddress(new PublicKey(poolInfo.owner), new PublicKey(poolInfo.mintA.address))).publicKey,
        (await getATAAddress(new PublicKey(poolInfo.owner), new PublicKey(poolInfo.mintB.address))).publicKey,
        getPdaVault(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), new PublicKey(poolInfo.mintA.address)).publicKey,
        getPdaVault(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), new PublicKey(poolInfo.mintB.address)).publicKey,
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        new PublicKey(poolInfo.mintA.address),
        new PublicKey(poolInfo.mintB.address),
        new PublicKey(poolInfo.observationId),
        new BN(new Decimal(inputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)),
        new BN(new Decimal(outputAmount).mul(10 ** poolInfo.mintB.decimals).toFixed(0))
      );

      // Here you would add the instruction to a transaction and send it
      console.log('Swap instruction created:', swapIx);
    } catch (error) {
      console.error('Error creating swap instruction:', error);
    }
  };

  if (isLoading) {
    return <Container>Loading...</Container>;
  }

  return (
    <Container fluid className="min-h-screen bg-black p-8" style={{ color: '#39FF14' }}>
      <Title order={1} mb="xl" className="animate-pulse" style={{ fontSize: '2.25rem' }}>
        {mint} Details 🚀
      </Title>
      <Card withBorder mb="xl" style={{ backgroundColor: 'black', borderColor: '#39FF14' }}>
        <Card.Section>
          <Title order={2} p="md" style={{ color: '#39FF14' }}>Price Chart</Title>
        </Card.Section>
        <Card.Section p="md">
          <div style={{ height: '16rem' }}>
            <ResponsiveContainer width="100%" height="100%">
            <iframe
                  width="100%"
                  height="600"
                  src={`https://birdeye.so/tv-widget/${mint}?chain=solana&viewMode=pair&chartInterval=1m&chartType=CANDLE&chartTimezone=Asia%2FSingapore&chartLeftToolbar=show&theme=dark`}
                ></iframe>
            </ResponsiveContainer>
          </div>
        </Card.Section>
      </Card>
      <Card withBorder style={{ backgroundColor: 'black', borderColor: '#39FF14' }}>
        <Card.Section>
          <Title order={2} p="md" style={{ color: '#39FF14' }}>Interact with {mint}</Title>
        </Card.Section>
        <Card.Section p="md">
          <Stack>
            <Group grow>
              <TextInput 
                type="number" 
                placeholder="Input Amount" 
                value={inputAmount}
                onChange={(event) => setInputAmount(event.currentTarget.value)}
                style={{ flex: 1, backgroundColor: 'black', color: '#39FF14', borderColor: '#39FF14' }} 
              />
              <TextInput 
                type="number" 
                placeholder="Output Amount" 
                value={outputAmount}
                onChange={(event) => setOutputAmount(event.currentTarget.value)}
                style={{ flex: 1, backgroundColor: 'black', color: '#39FF14', borderColor: '#39FF14' }} 
              />
            </Group>
            <Group grow>
              <Button onClick={handleDeposit} style={{ backgroundColor: '#39FF14', color: 'black' }}>
                Deposit
              </Button>
              <Button onClick={handleWithdraw} style={{ backgroundColor: '#FF3131', color: 'black' }}>
                Withdraw
              </Button>
              <Button onClick={handleSwap} style={{ backgroundColor: '#4D4DFF', color: 'black' }}>
                Swap
              </Button>
            </Group>
          </Stack>
        </Card.Section>
      </Card>
      {poolInfo && (
        <Card withBorder mt="xl" style={{ backgroundColor: 'black', borderColor: '#39FF14' }}>
          <Card.Section>
            <Title order={2} p="md" style={{ color: '#39FF14' }}>Pool Info</Title>
          </Card.Section>
          <Card.Section p="md">
            <Text>Pool ID: {poolInfo.id}</Text>
            <Text>Token A: {poolInfo.mintA.symbol} ({poolInfo.mintA.address})</Text>
            <Text>Token B: {poolInfo.mintB.symbol} ({poolInfo.mintB.address})</Text>
            <Text>LP Token: {poolInfo.lpMint.address}</Text>
            <Text>Total Liquidity: {poolInfo.lpAmount}</Text>
          </Card.Section>
        </Card>
      )}
    </Container>
  );
}

function processKlineData(data: any[]): any[] {
  // Sort the data by timestamp
  data.sort((a, b) => a.timestamp - b.timestamp);

  // Group data into 1-minute intervals
  const interval = 60; // 1 minute in seconds
  let currentGroup: any[] = [];
  let currentGroupStart = Math.floor(data[0].timestamp / interval) * interval;

  const klineData: any[] = [];

  data.forEach((item) => {
    if (item.timestamp >= currentGroupStart + interval) {
      // Process the current group
      if (currentGroup.length > 0) {
        const kline = {
          time: new Date(currentGroupStart * 1000).toISOString(),
          open: currentGroup[0].buy_price,
          high: Math.max(...currentGroup.map(d => d.buy_price)),
          low: Math.min(...currentGroup.map(d => d.buy_price)),
          close: currentGroup[currentGroup.length - 1].buy_price,
          volume: currentGroup.length, // Using count as volume, adjust if you have actual volume data
        };
        klineData.push(kline);
      }
      // Start a new group
      currentGroup = [];
      currentGroupStart = Math.floor(item.timestamp / interval) * interval;
    }
    currentGroup.push(item);
  });

  // Process the last group
  if (currentGroup.length > 0) {
    const kline = {
      time: new Date(currentGroupStart * 1000).toISOString(),
      open: currentGroup[0].buy_price,
      high: Math.max(...currentGroup.map(d => d.buy_price)),
      low: Math.min(...currentGroup.map(d => d.buy_price)),
      close: currentGroup[currentGroup.length - 1].buy_price,
      volume: currentGroup.length,
    };
    klineData.push(kline);
  }

  return klineData;
}