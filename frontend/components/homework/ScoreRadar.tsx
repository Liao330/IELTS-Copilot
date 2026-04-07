"use client";

import React from "react";

interface ScoreDimension {
  key: string;
  label: string;
  label_en: string;
  score: number;
}

interface ScoresData {
  dimensions: ScoreDimension[];
  overall: number;
  category: string;
}

interface ScoreRadarProps {
  scores: ScoresData;
}

const MAX_SCORE = 9;

function getScoreColor(score: number): string {
  if (score >= 7) return "#22c55e"; // green-500
  if (score >= 6) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

function getScoreColorClass(score: number): string {
  if (score >= 7) return "text-green-600 dark:text-green-400";
  if (score >= 6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getBarBgClass(score: number): string {
  if (score >= 7) return "bg-green-500";
  if (score >= 6) return "bg-yellow-500";
  return "bg-red-500";
}

function getOverallBgClass(score: number): string {
  if (score >= 7) return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
  if (score >= 6) return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800";
  return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
}

/**
 * 将极坐标转换为 SVG 坐标
 * angle: 从顶部开始顺时针（弧度）
 */
function polarToCartesian(cx: number, cy: number, r: number, angleRad: number): [number, number] {
  // 从顶部（-90度）开始
  const x = cx + r * Math.sin(angleRad);
  const y = cy - r * Math.cos(angleRad);
  return [x, y];
}

function RadarChart({ dimensions }: { dimensions: ScoreDimension[] }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 80;
  const n = dimensions.length;
  const angleStep = (2 * Math.PI) / n;

  // 网格线（刻度 3, 5, 7, 9）
  const gridLevels = [3, 5, 7, 9];

  // 数据点
  const dataPoints = dimensions.map((dim, i) => {
    const angle = i * angleStep;
    const r = (dim.score / MAX_SCORE) * maxR;
    return polarToCartesian(cx, cy, r, angle);
  });
  const dataPolygon = dataPoints.map((p) => p.join(",")).join(" ");

  // 轴标签位置（稍微偏移到外部）
  const labelPoints = dimensions.map((_, i) => {
    const angle = i * angleStep;
    return polarToCartesian(cx, cy, maxR + 18, angle);
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ maxWidth: 200, maxHeight: 200 }}>
      {/* 网格多边形 */}
      {gridLevels.map((level) => {
        const r = (level / MAX_SCORE) * maxR;
        const pts = Array.from({ length: n }, (_, i) => {
          const angle = i * angleStep;
          return polarToCartesian(cx, cy, r, angle).join(",");
        }).join(" ");
        return (
          <polygon
            key={level}
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth={level === 9 ? 1 : 0.5}
            className="text-muted-foreground/30"
          />
        );
      })}

      {/* 轴线 */}
      {dimensions.map((_, i) => {
        const angle = i * angleStep;
        const [ex, ey] = polarToCartesian(cx, cy, maxR, angle);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={ex}
            y2={ey}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-muted-foreground/30"
          />
        );
      })}

      {/* 数据填充区域 */}
      <polygon
        points={dataPolygon}
        fill="hsl(217, 91%, 60%)"
        fillOpacity={0.2}
        stroke="hsl(217, 91%, 60%)"
        strokeWidth={2}
      />

      {/* 数据点圆圈 */}
      {dataPoints.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3}
          fill={getScoreColor(dimensions[i].score)}
          stroke="white"
          strokeWidth={1.5}
        />
      ))}

      {/* 维度标签 */}
      {dimensions.map((dim, i) => {
        const [lx, ly] = labelPoints[i];
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground"
            fontSize={10}
            fontWeight={500}
          >
            {dim.key}
          </text>
        );
      })}
    </svg>
  );
}

export default function ScoreRadar({ scores }: ScoreRadarProps) {
  const { dimensions, overall, category } = scores;

  return (
    <div className="rounded-lg border bg-gradient-to-br from-card to-muted/20 p-4 mb-4">
      <div className="flex items-start gap-4">
        {/* 左侧：雷达图 */}
        <div className="shrink-0 flex items-center justify-center" style={{ width: 200, height: 200 }}>
          <RadarChart dimensions={dimensions} />
        </div>

        {/* 右侧：总分 + 维度条 */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* 总分 */}
          <div className={`inline-flex items-center gap-3 rounded-lg border px-4 py-2 ${getOverallBgClass(overall)}`}>
            <div>
              <div className="text-xs text-muted-foreground font-medium">
                {category === "speaking" ? "口语总分" : "写作总分"}
              </div>
              <div className={`text-3xl font-bold ${getScoreColorClass(overall)}`}>
                {overall % 1 === 0 ? overall.toFixed(0) : overall.toFixed(1)}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">/ {MAX_SCORE}</div>
          </div>

          {/* 维度进度条 */}
          <div className="space-y-2">
            {dimensions.map((dim) => (
              <div key={dim.key} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-10 shrink-0 font-mono font-medium">
                  {dim.key}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getBarBgClass(dim.score)}`}
                    style={{ width: `${(dim.score / MAX_SCORE) * 100}%` }}
                  />
                </div>
                <span className={`text-sm font-semibold w-6 text-right ${getScoreColorClass(dim.score)}`}>
                  {dim.score % 1 === 0 ? dim.score.toFixed(0) : dim.score.toFixed(1)}
                </span>
              </div>
            ))}
          </div>

          {/* 维度名称图例 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {dimensions.map((dim) => (
              <span key={dim.key} className="text-[10px] text-muted-foreground">
                <span className="font-medium">{dim.key}</span>: {dim.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
