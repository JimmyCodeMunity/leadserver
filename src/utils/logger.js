// Simple structured logger — no external transport dependencies.
// Works identically in local dev and Vercel serverless production.
const LEVEL_NUMS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVEL_NUMS[process.env.LOG_LEVEL] || LEVEL_NUMS.info;

function log(level, levelNum, ...args) {
    if (levelNum < MIN_LEVEL) return;

    // args can be (msg), (obj, msg), or (obj, msg, ...rest)
    let obj = {};
    let msg = '';

    if (typeof args[0] === 'string') {
        msg = args[0];
    } else if (args[0] && typeof args[0] === 'object') {
        obj = args[0];
        msg = typeof args[1] === 'string' ? args[1] : '';
    }

    const entry = {
        level: levelNum,
        time: Date.now(),
        ...obj,
        msg,
    };

    const out = JSON.stringify(entry);
    if (levelNum >= LEVEL_NUMS.error) {
        process.stderr.write(out + '\n');
    } else {
        process.stdout.write(out + '\n');
    }
}

const logger = {
    debug: (...args) => log('debug', LEVEL_NUMS.debug, ...args),
    info: (...args) => log('info', LEVEL_NUMS.info, ...args),
    warn: (...args) => log('warn', LEVEL_NUMS.warn, ...args),
    error: (...args) => log('error', LEVEL_NUMS.error, ...args),
};

module.exports = logger;
