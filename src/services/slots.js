// a limit on how many jobs run at the same time, more wait for a free slot
exports.createSlots = (max) => {
    let running = 0;
    const waiting = [];
    return {
        // resolves when a slot is free, rejects with the error from makeError when none frees up in time
        acquire(waitMs, makeError) {
            if (running < max) {
                running++;
                return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
                const waiter = { resolve };
                waiter.timer = setTimeout(() => {
                    waiting.splice(waiting.indexOf(waiter), 1);
                    reject(makeError());
                }, waitMs);
                waiting.push(waiter);
            });
        },
        // hands the slot to the next waiting job, or frees it
        release() {
            const next = waiting.shift();
            if (!next) {
                running--;
                return;
            }
            clearTimeout(next.timer);
            next.resolve();
        },
    };
};
