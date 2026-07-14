const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
    level: isDev ? 'debug' : 'info',
    // pino-pretty is only available locally — never use transport in production
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: { colorize: true },
        },
    }),
});

module.exports = logger;
