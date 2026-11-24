export default function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="heading">
      <div>
        <span className="eyebrow dark">FOOD-FLOW</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
    </div>
  );
}
