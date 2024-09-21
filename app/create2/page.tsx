"use client";

import React from 'react'

import TokenLaunchpad from '@/components/TokenLaunchpad';
import { Box, Text } from '@mantine/core';
export default function CreatePage() {
  return (<>
    <Box className="mb-4">
    <Text className="font-semibold text-yellow-400">Gobbler Fee Distribution</Text>
    <Text>When you buy tokens, you have a chance to receive all transaction fees!</Text>
    <Text>The more you buy, the higher your chances of winning fees.</Text>
  </Box>
  <Box className="mb-4">
    <Text className="font-semibold text-purple-400">Dynamic Fee Structure</Text>
    <Text>Fees may vary based on market conditions and user activity.</Text>
    <Text>Stay active to potentially benefit from lower fees!</Text>
  </Box>
    <TokenLaunchpad /></>
  )
}