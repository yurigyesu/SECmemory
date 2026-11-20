import React from 'react';

interface TopHeaderProps {
  canShareOrCopy: boolean;
  shareFeedback: string | null;
  copyFeedback: string | null;
  onOpenCatalog: () => void;
  onShareUrl: () => void;
  onCopySpec: () => void;
  onToggleTheme: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  canShareOrCopy,
  shareFeedback,
  copyFeedback,
  onOpenCatalog,
  onShareUrl,
  onCopySpec,
  onToggleTheme,
}) => {
  return (
    <header className="top-header">
      <div className="brand-cluster">
        <div className="brand-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </svg>
        </div>
        <div>
          <h1 className="brand-title">SECmemory</h1>
          <p className="brand-subtitle">Samsung Memory Code Decoder</p>
        </div>
      </div>

      <nav className="header-actions" aria-label="도구 메뉴">
        <button type="button" className="btn" onClick={onOpenCatalog}>
          <span aria-hidden="true">▤</span>
          <span>카탈로그 / DB</span>
        </button>

        <button
          type="button"
          className="btn"
          disabled={!canShareOrCopy}
          onClick={onShareUrl}
          title="현재 코드 링크 복사"
        >
          <span aria-hidden="true">↗</span>
          <span>{shareFeedback ?? '공유'}</span>
        </button>

        <button
          type="button"
          className="btn"
          disabled={!canShareOrCopy}
          onClick={onCopySpec}
          title="해석 결과 텍스트 복사"
        >
          <span aria-hidden="true">❐</span>
          <span>{copyFeedback ?? '복사'}</span>
        </button>

        <button
          type="button"
          className="btn btn-icon"
          onClick={onToggleTheme}
          aria-label="색상 테마 전환"
          title="라이트 / 다크 테마 전환"
        >
          <span className="theme-toggle-icon-dark" aria-hidden="true">
            ☾
          </span>
          <span className="visually-hidden theme-toggle-icon-dark">다크 모드로 전환</span>
          <span className="theme-toggle-icon-light" aria-hidden="true">
            ☀
          </span>
          <span className="visually-hidden theme-toggle-icon-light">라이트 모드로 전환</span>
        </button>
      </nav>
    </header>
  );
};
