const crypto = require('crypto');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
        this.saltLength = 32;
    }

    /**
     * Generar clave de encriptación a partir de password
     */
    generateKeyFromPassword(password, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(this.saltLength);
        }
        
        const key = crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
        return { key, salt };
    }

    /**
     * Encriptar datos
     */
    encrypt(data, password) {
        try {
            // Convertir datos a JSON string
            const jsonData = JSON.stringify(data);
            
            // Generar salt y clave
            const { key, salt } = this.generateKeyFromPassword(password);
            
            // Generar IV
            const iv = crypto.randomBytes(this.ivLength);
            
            // Crear cipher
            const cipher = crypto.createCipher(this.algorithm, key);
            cipher.setAAD(salt); // Additional Authenticated Data
            
            // Encriptar
            let encrypted = cipher.update(jsonData, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Obtener tag de autenticación
            const tag = cipher.getAuthTag();
            
            // Combinar todos los componentes
            const result = {
                encrypted: encrypted,
                salt: salt.toString('hex'),
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                timestamp: Date.now()
            };
            
            return Buffer.from(JSON.stringify(result)).toString('base64');
        } catch (error) {
            throw new Error(`Error encriptando datos: ${error.message}`);
        }
    }

    /**
     * Desencriptar datos
     */
    decrypt(encryptedData, password) {
        try {
            // Decodificar datos
            const decoded = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
            
            // Extraer componentes
            const salt = Buffer.from(decoded.salt, 'hex');
            const iv = Buffer.from(decoded.iv, 'hex');
            const tag = Buffer.from(decoded.tag, 'hex');
            const encrypted = decoded.encrypted;
            
            // Generar clave con el mismo salt
            const { key } = this.generateKeyFromPassword(password, salt);
            
            // Crear decipher
            const decipher = crypto.createDecipher(this.algorithm, key);
            decipher.setAAD(salt);
            decipher.setAuthTag(tag);
            
            // Desencriptar
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            // Parsear JSON
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error(`Error desencriptando datos: ${error.message}`);
        }
    }

    /**
     * Encriptar solo texto para nombres de columnas
     */
    encryptText(text, password) {
        try {
            const { key, salt } = this.generateKeyFromPassword(password);
            const iv = crypto.randomBytes(this.ivLength);
            
            const cipher = crypto.createCipher(this.algorithm, key);
            cipher.setAAD(salt);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();
            
            const result = {
                encrypted: encrypted,
                salt: salt.toString('hex'),
                iv: iv.toString('hex'),
                tag: tag.toString('hex')
            };
            
            return Buffer.from(JSON.stringify(result)).toString('base64');
        } catch (error) {
            throw new Error(`Error encriptando texto: ${error.message}`);
        }
    }

    /**
     * Desencriptar texto
     */
    decryptText(encryptedText, password) {
        try {
            const decoded = JSON.parse(Buffer.from(encryptedText, 'base64').toString());
            
            const salt = Buffer.from(decoded.salt, 'hex');
            const tag = Buffer.from(decoded.tag, 'hex');
            const encrypted = decoded.encrypted;
            
            const { key } = this.generateKeyFromPassword(password, salt);
            
            const decipher = crypto.createDecipher(this.algorithm, key);
            decipher.setAAD(salt);
            decipher.setAuthTag(tag);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Error desencriptando texto: ${error.message}`);
        }
    }

    /**
     * Generar hash de validación para clave
     */
    generateKeyHash(password) {
        const salt = crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
        return {
            hash: hash.toString('hex'),
            salt: salt.toString('hex')
        };
    }

    /**
     * Validar clave
     */
    validateKey(password, storedHash, storedSalt) {
        const salt = Buffer.from(storedSalt, 'hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
        return hash.toString('hex') === storedHash;
    }

    /**
     * Generar clave aleatoria segura
     */
    generateSecureKey(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Dividir datos encriptados en múltiples columnas
     */
    splitEncryptedData(encryptedString, columnCount = 5) {
        const chunkSize = Math.ceil(encryptedString.length / columnCount);
        const chunks = [];
        
        for (let i = 0; i < encryptedString.length; i += chunkSize) {
            chunks.push(encryptedString.substring(i, i + chunkSize));
        }
        
        // Rellenar con strings aleatorios si es necesario
        while (chunks.length < columnCount) {
            chunks.push(crypto.randomBytes(chunkSize / 2).toString('hex'));
        }
        
        return chunks;
    }

    /**
     * Reconstruir datos encriptados desde múltiples columnas
     */
    combineEncryptedChunks(chunks) {
        return chunks.filter(chunk => chunk && chunk.length > 0).join('');
    }
}

module.exports = EncryptionService;