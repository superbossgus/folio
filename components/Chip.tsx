export default function Chip({ clase, children }: { clase: string; children: React.ReactNode }) {
  return <span className={`chip ${clase}`}>{children}</span>;
}
