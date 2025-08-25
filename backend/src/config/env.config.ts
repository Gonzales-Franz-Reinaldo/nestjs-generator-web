export const getEnvConfig = () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    globalPrefix: process.env.GLOBAL_PREFIX || 'api',
    corsOrigin: process.env.CORS_ORIGIN || '*',
});