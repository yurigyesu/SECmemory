import React, { useState } from 'react';
import type { MemorySpecSummary } from '../decoder/engine';

interface ModuleCalculatorProps {
  summary: MemorySpecSummary;
}

const CHIP_COUNTS = [4, 8, 16, 32] as const;

export const ModuleCalculator: React.FC<ModuleCalculatorProps> = ({ summary }) => {
  const [chipCount, setChipCount] = useState<number>(8);

  if (
    summary.category === 'NAND' ||
    summary.category === 'FLASH' ||
    summary.category === 'MODULE' ||
    !summary.densityGb
  ) {
    return null;
  }

  const totalGb = summary.densityGb * chipCount;
  const totalGB = totalGb / 8;
  const totalBus = summary.bitWidth ? summary.bitWidth * chipCount : null;
  const totalBw = summary.singleChipBandwidthGBs
    ? Number((summary.singleChipBandwidthGBs * chipCount).toFixed(1))
    : null;

  return (
    <div className="calc-bar" aria-label="다중 칩 구성 계산기">
      <div>
        <span>다중 칩 구성: </span>
        <strong className="mono">
          {Number.isInteger(totalGB) ? totalGB : totalGB.toFixed(1)} GB
        </strong>
        {totalBus && <span className="mono"> · {totalBus}-bit</span>}
        {totalBw && <span className="mono"> · {totalBw} GB/s</span>}
      </div>

      <div className="calc-chip-group" role="group" aria-label="칩 개수 선택">
        {CHIP_COUNTS.map((cnt) => (
          <button
            key={cnt}
            type="button"
            className="calc-btn"
            aria-pressed={chipCount === cnt}
            onClick={() => setChipCount(cnt)}
          >
            ×{cnt}
          </button>
        ))}
      </div>
    </div>
  );
};
