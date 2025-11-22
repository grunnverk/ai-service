/**
 * Optional logger support
 * If winston is available as a peer dependency, use it
 * Otherwise, provide a no-op logger
 */

import type { Logger } from './types';

let logger: Logger | undefined;

/**
 * Set a custom logger instance
 */
export function setLogger(customLogger: Logger): void {
    logger = customLogger;
}

/**
 * Create a no-op logger that does nothing
 */
export function createNoOpLogger(): Logger {
    return {
        info: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
    };
}

/**
 * Attempt to load winston logger
 * @returns winston logger if available, otherwise null
 */
export function tryLoadWinston(): Logger | null {
    try {
        // Dynamic import to avoid hard dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const winston = require('winston');
        if (winston && winston.createLogger) {
            return winston.createLogger({
                level: 'info',
                format: winston.format.simple(),
                transports: [new winston.transports.Console()],
            });
        }
    } catch {
        // Winston not available
    }
    return null;
}

/**
 * Get the current logger or a no-op logger
 */
export function getLogger(): Logger {
    if (logger) {
        return logger;
    }

    // Try to load winston if available
    const winstonLogger = tryLoadWinston();
    if (winstonLogger) {
        logger = winstonLogger;
        return winstonLogger;
    }

    // Return no-op logger
    return createNoOpLogger();
}
