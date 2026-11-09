import { useEffect, useState } from 'react';

/** Artwork image with a deterministic initials fallback when missing/broken. */
export default function Artwork({
  src,
  title,
  size = 300,
  fluid = false,
  className = '',
}: {
  src: string | null | undefined;
  title: string;
  size?: number;
  /** fill the parent container (parent must have aspect-ratio or fixed height) */
  fluid?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    const initials = title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
    const style: React.CSSProperties = fluid ? { width: '100%', height: '100%' } : { width: size, height: size };
    return (
      <div className={`artwork artwork-fallback ${className}`} style={style} aria-hidden="true">
        <span style={{ fontSize: fluid ? 64 : Math.round(size * 0.36) }}>{initials || 'JA'}</span>
      </div>
    );
  }
  if (fluid) {
    return <img className={`artwork ${className}`} src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={title} loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <img
      className={`artwork ${className}`}
      src={src}
      width={size}
      height={size}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
