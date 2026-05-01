"use client";

import { useMemo } from "react";

interface SparklineProps {
  data: Array<{ d: string; v: number }>;
  width?: number;
  height?: number;
  className?: string;
  // Color of the stroke. Falls back to the rose-500 we use everywhere.
  stroke?: string;
}

// Tiny dependency-free sparkline. Polyline + filled area under the line.
// Designed for KPI cards — accepts a 30-day series and normalizes to the
// SVG box. Renders nothing if all values are zero (cleaner empty state).
export function Sparkline({
  data,
  width = 120,
  height = 32,
  className,
  stroke = "rgb(244 63 94)",
}: SparklineProps) {
  const { line, area, hasData } = useMemo(() => {
    if (!data.length) return { line: "", area: "", hasData: false };
    const max = Math.max(...data.map((d) => d.v), 1);
    const min = 0;
    const range = max - min || 1;
    const stepX = data.length > 1 ? width / (data.length - 1) : width;
    const points = data.map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.v - min) / range) * (height - 2) - 1;
      return [x, y] as const;
    });
    const line = points.map(([x, y]) => `${x},${y}`).join(" ");
    const area = `${points[0][0]},${height} ${line} ${
      points[points.length - 1][0]
    },${height}`;
    return {
      line,
      area,
      hasData: data.some((d) => d.v > 0),
    };
  }, [data, width, height]);

  if (!hasData) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="sparkFade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sparkFade)" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
