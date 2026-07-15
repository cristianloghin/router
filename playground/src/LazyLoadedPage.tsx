export default function LazyLoadedPage() {
  return (
    <div className="card">
      <h2>Lazy route</h2>
      <p>
        This component was loaded via <code>React.lazy()</code> with an artificial 1.2s delay so the{" "}
        <code>loading</code> fallback is visible. RouterView wrapped it in Suspense automatically.
      </p>
    </div>
  );
}
