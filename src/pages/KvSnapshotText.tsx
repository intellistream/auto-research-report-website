import "./kv-snapshot-layout.css";

// Only text participates in sizing: no duplicated controls, identities or live regions.
export function KvSnapshotText({ text, variants = [] }: { text: string; variants?: readonly string[] }) {
  return <span className="kv-snapshot-text">
    <span className="kv-snapshot-size" aria-hidden="true">{variants.map((value, index) => <span key={index}>{value}</span>)}</span>
    <span className="kv-snapshot-current">{text}</span>
  </span>;
}
