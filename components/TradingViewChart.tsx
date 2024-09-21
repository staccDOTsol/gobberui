import React, { useEffect, useRef } from 'react'
import { createChart, ColorType, CandlestickData, Time, LineStyle } from 'lightweight-charts'

interface ChartProps {
  data: {
    time: number
    open: number
    high: number
    low: number
    close: number
    volume?: number
  }[]
}

const TradingViewChart: React.FC<ChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chartContainerRef.current && data && data.length > 0) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#131722' },
          textColor: '#d1d4dc',
        },
        width: chartContainerRef.current.clientWidth,
        height: 500,
        grid: {
          vertLines: { color: '#2B2B43', style: LineStyle.Dotted },
          horzLines: { color: '#2B2B43', style: LineStyle.Dotted },
        },
        crosshair: {
          mode: 0,
          vertLine: {
            width: 1,
            color: '#758696',
            style: LineStyle.Solid,
            labelBackgroundColor: '#758696',
          },
          horzLine: {
            width: 1,
            color: '#758696',
            style: LineStyle.Solid,
            labelBackgroundColor: '#758696',
          },
        },
        timeScale: {
          borderColor: '#2B2B43',
        },
        rightPriceScale: {
          borderColor: '#2B2B43',
        },
      })

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      })

      const candles: CandlestickData<Time>[] = data.map(item => ({
        time: item.time as Time,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close
      }))
      candlestickSeries.setData(candles)

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
      })

      volumeSeries.setData(data.map(item => ({
        time: item.time as Time,
        value: item.volume || 0,
        color: item.close > item.open ? '#26a69a' : '#ef5350'
      })))

      chart.timeScale().fitContent()

      const handleResize = () => {
        chart.applyOptions({ width: chartContainerRef.current!.clientWidth })
      }

      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        chart.remove()
      }
    }
  }, [data])

  return <div ref={chartContainerRef} />
}

export default TradingViewChart