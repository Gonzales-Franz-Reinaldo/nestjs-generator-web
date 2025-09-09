const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = require('./src/app');
const generatorService = require('./src/services/generator.service');

// Inicializar limpieza automática de proyectos antiguos
generatorService.startCleanupSchedule();

const PORT = process.env.PORT || 3004;

// Crear directorio para proyectos generados si no existe
const generatedProjectsDir = path.join(__dirname, 'generated-projects');
if (!fs.existsSync(generatedProjectsDir)) {
    fs.mkdirSync(generatedProjectsDir, { recursive: true });
}

// Iniciar servidor
const server = app.listen(PORT, () => {
    console.log('\n🚀 NestJS Generator Web Server');
    console.log('===================================');
    console.log(`📱 Servidor ejecutándose en: http://localhost:${PORT}`);
    console.log(`📁 Proyectos generados en: ${generatedProjectsDir}`);
    console.log('🔗 Frontend debe ejecutarse en: http://localhost:5173');
    console.log('===================================\n');
});

// Manejo de errores del servidor
server.on('error', (error) => {
    console.error('❌ Error del servidor:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🔄 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n🔄 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado exitosamente');
        process.exit(0);
    });
});