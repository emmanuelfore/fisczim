const { Worker } = require('worker_threads');
const path = require('path');

class WorkerPool {
  constructor(size = 2) {
    this.size = size;
    this.workers = [];
    this.queue = [];
  }

  _getWorker() {
    if (this.workers.length < this.size) {
      const w = new Worker(path.join(__dirname, 'workerTask.js'));
      this.workers.push(w);
      return w;
    }
    return null;
  }

  run(task, data) {
    return new Promise((resolve, reject) => {
      const w = this._getWorker();
      if (w) {
        w.once('message', resolve);
        w.once('error', reject);
        w.postMessage({ task, data });
      } else {
        this.queue.push({ task, data, resolve, reject });
      }
    });
  }
}

module.exports = { WorkerPool };