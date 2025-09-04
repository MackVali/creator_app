import FlameEmber from "../FlameEmber";
export default function FlameEmberDemo() {
  const levels = ["NO","LOW","MEDIUM","HIGH","ULTRA","EXTREME"] as const;
  const sizes = ["sm","md","lg"] as const;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:16 }}>
      {levels.map(l => (
        <div key={l} style={{ display:"grid", placeItems:"center", gap:8 }}>
          <div style={{ fontSize:12, opacity:.7 }}>{l}</div>
          {sizes.map(s => <FlameEmber key={s} level={l} size={s} />)}
        </div>
      ))}
    </div>
  );
}
