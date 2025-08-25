const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas
const databaseRoutes = require('./routes/database');
const generatorRoutes = require('./routes/generator');

const encryptedAuditRoutes = require('./routes/encrypted-audit');

const app = express();

// Middlewares globales
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// Logger middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Servir archivos estáticos
app.use('/downloads', express.static(path.join(__dirname, '../generated-projects')));


// Rutas principales
app.use('/api/database', databaseRoutes);
app.use('/api/generator', generatorRoutes);
app.use('/api/encrypted-audit', encryptedAuditRoutes);

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Servir archivos estáticos (proyectos generados)
app.use('/api/downloads', express.static(path.join(__dirname, '..', 'generated-projects')));

// Manejo de errores 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.originalUrl,
        method: req.method
    });
});

// Manejo global de errores
app.use((error, req, res, next) => {
    console.error('❌ Error:', error);

    res.status(error.status || 500).json({
        error: error.message || 'Error interno del servidor',
        timestamp: new Date().toISOString(),
        path: req.path,
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

module.exports = app;