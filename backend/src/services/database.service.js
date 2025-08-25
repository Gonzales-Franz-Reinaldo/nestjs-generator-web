const { Client } = require('pg');
const mysql = require('mysql2/promise');

class DatabaseService {
    async testConnection(config) {
        try {
            console.log(`🔌 Testing ${config.type} connection to ${config.host}:${config.port}/${config.database}`);

            if (config.type === 'postgresql') {
                return await this.testPostgreSQLConnection(config);
            } else if (config.type === 'mysql') {
                return await this.testMySQLConnection(config);
            } else {
                throw new Error('Tipo de base de datos no soportado');
            }
        } catch (error) {
            console.error('❌ Database connection test failed:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async testPostgreSQLConnection(config) {
        const client = new Client({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionTimeoutMillis: 5000,
        });

        try {
            await client.connect();

            // Obtener lista de tablas
            const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);

            const tables = result.rows.map(row => row.table_name);

            await client.end();

            console.log(`✅ PostgreSQL connection successful! Found ${tables.length} tables`);

            return {
                success: true,
                message: `Conexión exitosa a PostgreSQL. ${tables.length} tablas encontradas.`,
                tables: tables
            };
        } catch (error) {
            await client.end().catch(() => { });
            throw new Error(`Error de conexión PostgreSQL: ${error.message}`);
        }
    }

    async testMySQLConnection(config) {
        let connection;

        try {
            connection = await mysql.createConnection({
                host: config.host,
                port: config.port,
                user: config.username,
                password: config.password,
                database: config.database,
                connectTimeout: 5000,
            });

            // Obtener lista de tablas
            const [rows] = await connection.execute(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = ? 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `, [config.database]);

            const tables = rows.map(row => row.table_name);

            await connection.end();

            console.log(`✅ MySQL connection successful! Found ${tables.length} tables`);

            return {
                success: true,
                message: `Conexión exitosa a MySQL/MariaDB. ${tables.length} tablas encontradas.`,
                tables: tables
            };
        } catch (error) {
            if (connection) {
                await connection.end().catch(() => { });
            }
            throw new Error(`Error de conexión MySQL: ${error.message}`);
        }
    }

    async getTables(config) {
        if (config.type === 'postgresql') {
            return await this.getPostgreSQLTables(config);
        } else {
            return await this.getMySQLTables(config);
        }
    }

    async getPostgreSQLTables(config) {
        const client = new Client({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
        });

        try {
            await client.connect();

            const result = await client.query(`
        SELECT 
          t.table_name,
          COUNT(c.column_name) as column_count
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public' 
        AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_name
        ORDER BY t.table_name;
      `);

            await client.end();

            return result.rows;
        } catch (error) {
            await client.end().catch(() => { });
            throw error;
        }
    }

    async getMySQLTables(config) {
        const connection = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
        });

        try {
            const [rows] = await connection.execute(`
        SELECT 
          t.table_name,
          COUNT(c.column_name) as column_count
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = ? 
        AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_name
        ORDER BY t.table_name;
      `, [config.database]);

            await connection.end();

            return rows;
        } catch (error) {
            await connection.end().catch(() => { });
            throw error;
        }
    }
}

module.exports = new DatabaseService();