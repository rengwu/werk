import { useMutation } from '@tanstack/react-query';

export function FactoryReset() {
  const reset = useMutation({ mutationFn: () => window.werk.factoryReset() });
  return <div className="factory-reset">
    <h2>Factory reset</h2>
    <p>Delete all werk data, disconnect ChatGPT and restore default settings.</p>
    <button disabled={reset.isPending} onClick={() => reset.mutate()}>Reset werk</button>
    {reset.isPending && <p role="status">Waiting for confirmation or reset…</p>}
    {reset.error && <p role="alert">{reset.error.message}</p>}
  </div>;
}
