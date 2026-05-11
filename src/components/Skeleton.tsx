interface Props {
  count?: number;
}

export function SkeletonGrid({ count = 8 }: Props) {
  return (
    <div className="grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skel skel-line" />
          <div className="skel skel-line skel-line-2" />
        </div>
      ))}
    </div>
  );
}
