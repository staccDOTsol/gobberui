// gobberui2/components/TradingViewChart.tsx
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from "@mantine/core"  
import { CartesianGrid, LineChart, XAxis, YAxis, Tooltip, Line } from 'recharts'

declare global {
  interface Window {
    TradingView: any
  }
}

interface TradingViewChartProps {
  symbol: string
  theme?: 'light' | 'dark'
  mintAddress: string
  candlestickData: CandlestickData[]
}

interface CandlestickData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export default function TradingViewChart({ symbol, theme = 'dark', mintAddress, candlestickData }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState('1s')
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])


  const initializeTradingView = () => {
    if (containerRef.current && window.TradingView && candlestickData.length > 0) {
      const widgetOptions = {
        symbol: symbol,
        interval: timeframe,
        timezone: "Etc/UTC",
        theme: theme,
        style: "1",
        locale: "en",
        toolbar_bg: "#f1f3f6",
        enable_publishing: false,
        allow_symbol_change: true,
        container_id: containerRef.current.id,
        datafeed: {
          onReady: (callback: any) => {
            setTimeout(() => callback({}), 0)
          },
          resolveSymbol: (symbolName: string, onSymbolResolvedCallback: any) => {
            onSymbolResolvedCallback({
              name: symbolName,
              full_name: symbolName,
              description: symbolName,
              type: 'crypto',
              session: '24x7',
              timezone: 'Etc/UTC',
              exchange: '',
              minmov: 1,
              pricescale: 100000000,
              has_intraday: true,
              supported_resolutions: ['1', '5', '15', '30', '60', 'D', 'W', 'M'],
              volume_precision: 8,
              data_status: 'streaming',
            })
          },
          getBars: (symbolInfo: any, resolution: any, from: any, to: any, onHistoryCallback: any) => {
            const bars = candlestickData.map(d => ({
              time: d.time * 1000, // Convert to milliseconds
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume
            }))
            onHistoryCallback(bars, { noData: bars.length === 0 })
          },
          subscribeBars: () => {},
          unsubscribeBars: () => {},
        },
        library_path: "/tv.js",
        fullscreen: false,
        autosize: true,
        studies_overrides: {},
        disabled_features: ["use_localstorage_for_settings"],
        enabled_features: ["study_templates"],
        charts_storage_url: 'https://saveload.tradingview.com',
        charts_storage_api_version: "1.1",
        client_id: 'tradingview.com',
        user_id: 'public_user_id',
        loading_screen: { backgroundColor: "#000000" },
      }

      chartRef.current = new window.TradingView.widget(widgetOptions)
    }
  }

  useEffect(() => {
    if (!isLoading && !error && candlestickData.length > 0) {
      if (window.TradingView) {
        initializeTradingView()
      } else {
        const script = document.createElement('script')
        script.src = '/tv.js'
        script.async = true
        script.onload = initializeTradingView
        document.head.appendChild(script)
      }
    }

    return () => {
      if (chartRef.current && chartRef.current.remove) {
        chartRef.current.remove()
      }
    }
  }, [candlestickData, isLoading, error])

  const handleTimeframeChange = (value: string) => {
    setTimeframe(value)
  }


  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] space-y-4">
        <p className="text-red-500">{error}</p>
        {isClient && ( // Only render on client
          <Button onClick={() => handleTimeframeChange('60')}>Try 1 Hour Timeframe</Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {candlestickData.length > 0 ? (
        <LineChart width={600} height={300} data={candlestickData}>
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <CartesianGrid strokeDasharray="3 3" />
          <Line type="monotone" dataKey="close" stroke="#8884d8" />
        </LineChart>
      ) : (
        <div id="tradingview_widget" ref={containerRef} className="h-[500px] w-full" />
      )}
    </div>
  )
}