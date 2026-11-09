export function Skeleton({ style, className = '' }: { style?: React.CSSProperties; className?: string }) {
  return <div className={`skel ${className}`} style={style} aria-hidden="true" />;
}

export function UserHeaderSkeleton() {
  return (
    <div className="user-header" aria-busy="true">
      <Skeleton style={{ width: 132, height: 132, borderRadius: 4 }} />
      <div className="user-header-info">
        <Skeleton style={{ width: 280, height: 28, marginBottom: 10 }} />
        <Skeleton style={{ width: 170, height: 15, marginBottom: 16 }} />
        <Skeleton style={{ width: 340, height: 14 }} />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="card-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton style={{ width: '100%', aspectRatio: '1' }} />
          <Skeleton style={{ width: '85%', height: 14, marginTop: 10 }} />
          <Skeleton style={{ width: '55%', height: 12, marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function TrackListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="track-row track-row-skeleton">
          <Skeleton style={{ width: 34, height: 34, borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ width: '60%', height: 13 }} />
            <Skeleton style={{ width: '30%', height: 11, marginTop: 6 }} />
          </div>
          <Skeleton style={{ width: 160, height: 34 }} className="skel-wave" />
          <Skeleton style={{ width: 40, height: 12 }} />
        </div>
      ))}
    </div>
  );
}
