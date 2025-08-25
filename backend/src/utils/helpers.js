const path = require('path');
const fs = require('fs');

/**
 * Utilidades generales para el generador
 */
class Helpers {
    /**
     * Convierte snake_case a PascalCase
     */
    static toPascalCase(str) {
        return str
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    /**
     * Convierte snake_case a camelCase
     */
    static toCamelCase(str) {
        const pascalCase = this.toPascalCase(str);
        return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
    }

    /**
     * Convierte PascalCase o camelCase a kebab-case
     */
    static toKebabCase(str) {
        return str
            .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
            .toLowerCase();
    }

    /**
     * Convierte cualquier string a formato válido para nombre de archivo
     */
    static toFileName(str) {
        return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Valida si un string es un nombre válido para proyecto
     */
    static isValidProjectName(name) {
        return /^[a-zA-Z0-9-_]+$/.test(name) &&
            name.length >= 3 &&
            name.length <= 50;
    }

    /**
     * Formatea el tamaño de archivo en bytes a formato legible
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Crea un directorio de forma segura (recursiva)
     */
    static ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Genera un timestamp formateado para nombres de archivo
     */
    static getTimestamp() {
        return new Date().toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, -5); // Remover milisegundos
    }

    /**
     * Sanitiza texto para uso en código TypeScript
     */
    static sanitizeForCode(text) {
        return text
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^[0-9]/, '_$&') // No empezar con número
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Valida configuración de base de datos
     */
    static validateDatabaseConfig(config) {
        const required = ['type', 'host', 'database'];
        const missing = required.filter(field => !config[field]);

        if (missing.length > 0) {
            throw new Error(`Campos requeridos faltantes: ${missing.join(', ')}`);
        }

        if (!['postgresql', 'mysql'].includes(config.type)) {
            throw new Error('Tipo de base de datos no soportado');
        }

        return true;
    }

    /**
     * Genera un nombre único para proyecto
     */
    static generateUniqueProjectName(baseName, type) {
        const timestamp = this.getTimestamp();
        const sanitizedName = this.toFileName(baseName);
        return `${sanitizedName}-${type}-${timestamp}`;
    }

    /**
     * Obtiene estadísticas de un directorio
     */
    static getDirectoryStats(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return null;
        }

        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            return null;
        }

        let fileCount = 0;
        let totalSize = 0;

        const countFiles = (dir) => {
            const items = fs.readdirSync(dir);

            for (const item of items) {
                const itemPath = path.join(dir, item);
                const itemStats = fs.statSync(itemPath);

                if (itemStats.isDirectory()) {
                    countFiles(itemPath);
                } else {
                    fileCount++;
                    totalSize += itemStats.size;
                }
            }
        };

        countFiles(dirPath);

        return {
            fileCount,
            totalSize,
            formattedSize: this.formatFileSize(totalSize)
        };
    }

    /**
     * Log con timestamp
     */
    static log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📝';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    /**
     * Escapa caracteres especiales para uso en regex
     */
    static escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = Helpers;