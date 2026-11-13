// Company writes may overlap. Shared/auth mutations are exclusive barriers.
export function createMutationScheduler() {
  const pending = [], active = new Set();
  let exclusive = false;
  const pump = () => {
    if (exclusive) return;
    for (let i = 0; i < pending.length;) {
      const job = pending[i];
      if (job.key === null) {
        if (active.size) return;
        pending.splice(i, 1); exclusive = true; start(job); return;
      }
      if (active.has(job.key)) { i++; continue; }
      pending.splice(i, 1); active.add(job.key); start(job);
    }
  };
  const start = (job) => {
    Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
      if (job.key === null) exclusive = false; else active.delete(job.key);
      pump();
    });
  };
  return (key, task) => new Promise((resolve, reject) => { pending.push({ key, task, resolve, reject }); pump(); });
}
