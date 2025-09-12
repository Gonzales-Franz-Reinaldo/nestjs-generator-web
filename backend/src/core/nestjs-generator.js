const { Client } = require('pg');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

class NestJSBackendGenerator {
  constructor(config, outputDir, progressCallback) {
    this.dbType = config.type;
    this.config = {
      ...config,
      user: config.username || config.user
    };
    this.outputDir = outputDir;
    this.progressCallback = progressCallback || (() => { });
    this.pgClient = null;
    this.mysqlConnection = null;
    // Agregar crypto para JWT
    this.crypto = require('crypto');
  }

  async connect() {
    try {
      if (this.dbType === 'postgresql') {
        this.pgClient = new Client({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          database: this.config.database,
        });
        await this.pgClient.connect();
        console.log('✅ Conectado a PostgreSQL');
      } else if (this.dbType === 'mysql') {
        this.mysqlConnection = await mysql.createConnection({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          database: this.config.database,
        });
        console.log('✅ Conectado a MySQL/MariaDB');
      }
    } catch (error) {
      console.error('❌ Error de conexión a la base de datos:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.pgClient) {
        await this.pgClient.end();
        this.pgClient = null;
        console.log('🔌 Desconectado de PostgreSQL');
      }
      if (this.mysqlConnection) {
        await this.mysqlConnection.end();
        this.mysqlConnection = null;
        console.log('🔌 Desconectado de MySQL');
      }
    } catch (error) {
      console.error('❌ Error al desconectar:', error);
    }
  }

  async analyzeAuthTables(tables) {
    const authConfig = {
      userTable: null,
      roleTable: null,
      userRoleTable: null,
      profileTable: null,
      authType: 'none',
      // 🆕 AGREGAR: Información sobre servicios necesarios
      requiredServices: new Set()
    };

    const tableNames = tables.map(t => t.name.toLowerCase());

    // 🔍 Detectar tabla de usuarios
    const userPatterns = ['users', 'user', 'usuarios', 'usuario', 'accounts', 'account'];
    authConfig.userTable = this.findTableByPatterns(tables, userPatterns);

    // 🔍 Detectar tabla de roles
    const rolePatterns = ['roles', 'role', 'rol', 'permissions', 'permission'];
    authConfig.roleTable = this.findTableByPatterns(tables, rolePatterns);

    // 🔍 Detectar tabla de relación usuario-rol
    const userRolePatterns = [
      'user_roles', 'users_roles', 'user_role',
      'usuario_roles', 'usuarios_roles', 'personas_roles',
      'account_roles', 'user_permissions'
    ];
    authConfig.userRoleTable = this.findTableByPatterns(tables, userRolePatterns);

    // 🔍 Detectar tabla de perfil/información adicional
    const profilePatterns = ['profiles', 'profile', 'personas', 'persona', 'user_info', 'user_details'];
    authConfig.profileTable = this.findTableByPatterns(tables, profilePatterns);

    // 🎯 Determinar tipo de autenticación
    if (authConfig.userTable) {
      if (authConfig.roleTable && authConfig.userRoleTable) {
        authConfig.authType = 'complex'; // Sistema completo con roles
      } else {
        authConfig.authType = 'simple'; // Solo usuarios
      }
    }

    // 🆕 AGREGAR: Rastrear servicios necesarios
    if (authConfig.userTable) {
      authConfig.requiredServices.add(authConfig.userTable.name);
    }
    if (authConfig.roleTable) {
      authConfig.requiredServices.add(authConfig.roleTable.name);
    }
    if (authConfig.userRoleTable) {
      authConfig.requiredServices.add(authConfig.userRoleTable.name);
    }
    if (authConfig.profileTable) {
      authConfig.requiredServices.add(authConfig.profileTable.name);
    }

    console.log('🔍 Auth analysis result:', authConfig);
    return authConfig;
  }


  findTableByPatterns(tables, patterns) {
    for (const pattern of patterns) {
      const found = tables.find(t =>
        t.name.toLowerCase() === pattern ||
        t.name.toLowerCase().includes(pattern)
      );
      if (found) return found;
    }
    return null;
  }



  async analyzeUserTableStructure(userTable) {
    const columns = await this.getTableColumns(userTable.name);

    const structure = {
      tableName: userTable.name,
      primaryKey: null,
      usernameField: null,
      emailField: null,
      passwordField: null,
      statusField: null,
      createdAtField: null,
      updatedAtField: null,
      foreignKeys: []
    };

    // 🔍 Detectar campos automáticamente
    for (const col of columns) {
      const colName = col.name.toLowerCase();

      if (col.isPrimaryKey) {
        structure.primaryKey = col;
      }

      // Username patterns
      if (['username', 'user_name', 'login', 'nombre_email', 'email_usuario'].includes(colName)) {
        structure.usernameField = col;
      }

      // Email patterns
      if (['email', 'mail', 'correo', 'email_address'].includes(colName)) {
        structure.emailField = col;
      }

      // Password patterns
      if (['password', 'pass', 'contraseña', 'clave', 'passwd'].includes(colName)) {
        structure.passwordField = col;
      }

      // Status patterns
      if (['status', 'estado', 'active', 'activo', 'enabled', 'habilitado'].includes(colName)) {
        structure.statusField = col;
      }

      // Created at patterns
      if (['created_at', 'fecha_creacion', 'fecha', 'created', 'date_created'].includes(colName)) {
        structure.createdAtField = col;
      }

      // Updated at patterns
      if (['updated_at', 'fecha_actualizacion', 'updated', 'date_updated'].includes(colName)) {
        structure.updatedAtField = col;
      }
    }

    // Obtener claves foráneas
    structure.foreignKeys = await this.getForeignKeys(userTable.name);

    return structure;
  }

  async getTables() {
    try {
      if (this.dbType === 'postgresql') {
        const result = await this.pgClient.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `);

        const tables = [];
        for (const row of result.rows) {
          const columns = await this.getTableColumns(row.table_name);
          const foreignKeys = await this.getForeignKeys(row.table_name);
          tables.push({
            name: row.table_name,
            columns,
            foreignKeys
          });
        }
        return tables;
      } else {
        const [rows] = await this.mysqlConnection.execute(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = ? 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `, [this.config.database]);

        const tables = [];
        for (const row of rows) {
          const columns = await this.getTableColumns(row.table_name);
          const foreignKeys = await this.getForeignKeys(row.table_name);
          tables.push({
            name: row.table_name,
            columns,
            foreignKeys
          });
        }
        return tables;
      }
    } catch (error) {
      console.error('❌ Error obteniendo tablas:', error);
      throw error;
    }
  }

  async getTableColumns(tableName) {
    if (this.dbType === 'postgresql') {
      return await this.getPostgreSQLColumns(tableName);
    } else {
      return await this.getMySQLColumns(tableName);
    }
  }

  async getPostgreSQLColumns(tableName) {
    const result = await this.pgClient.query(`
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        INNER JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.column_name,
      type: this.mapDatabaseToTypeScript(row.data_type, 'postgresql'),
      nullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_primary_key,
      isAutoIncrement: row.column_default?.includes('nextval'),
      maxLength: row.character_maximum_length,
      dbType: row.data_type,
      defaultValue: row.column_default,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale,
    }));
  }

  async getMySQLColumns(tableName) {
    const [rows] = await this.mysqlConnection.execute(`
      SELECT 
        c.COLUMN_NAME as column_name,
        c.DATA_TYPE as data_type,
        c.IS_NULLABLE as is_nullable,
        c.COLUMN_DEFAULT as column_default,
        c.CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
        c.NUMERIC_PRECISION as numeric_precision,
        c.NUMERIC_SCALE as numeric_scale,
        c.COLUMN_KEY as column_key,
        c.EXTRA as extra,
        c.COLUMN_COMMENT as column_comment
      FROM information_schema.columns c
      WHERE c.table_name = ? AND c.table_schema = ?
      ORDER BY c.ordinal_position
    `, [tableName, this.config.database]);

    return rows.map(row => {
      // Detectar campos JSON por comentario para MariaDB
      const isJsonFieldByComment = row.column_comment === 'JSON_FIELD';
      const isJsonFieldByName = ['configuracion', 'control_asistencia'].includes(row.column_name);
      const isJsonField = isJsonFieldByComment || isJsonFieldByName;

      if (isJsonField) {
        console.log(`🔧 Campo JSON detectado en MariaDB: ${row.column_name} (${row.data_type}) - Comentario: ${row.column_comment}`);
      }

      return {
        name: row.column_name,
        type: this.mapDatabaseToTypeScript(row.data_type, 'mysql'),
        nullable: row.is_nullable === 'YES',
        isPrimaryKey: row.column_key === 'PRI',
        isAutoIncrement: row.extra?.toLowerCase().includes('auto_increment') || false,
        maxLength: isJsonField ? undefined : row.character_maximum_length,
        dbType: isJsonField ? 'json' : row.data_type,
        defaultValue: row.column_default,
        numericPrecision: row.numeric_precision,
        numericScale: row.numeric_scale,
        isJsonField: isJsonField,
      };
    });
  }
  async getForeignKeys(tableName) {
    if (this.dbType === 'postgresql') {
      return await this.getPostgreSQLForeignKeys(tableName);
    } else {
      return await this.getMySQLForeignKeys(tableName);
    }
  }

  async getPostgreSQLForeignKeys(tableName) {
    const result = await this.pgClient.query(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
    `, [tableName]);

    return result.rows.map(row => ({
      columnName: row.column_name,
      referencedTable: row.foreign_table_name,
      referencedColumn: row.foreign_column_name
    }));
  }



  async getMySQLForeignKeys(tableName) {
    const [rows] = await this.mysqlConnection.execute(`
      SELECT
        kcu.COLUMN_NAME as column_name,
        kcu.REFERENCED_TABLE_NAME AS foreign_table_name,
        kcu.REFERENCED_COLUMN_NAME AS foreign_column_name
      FROM information_schema.key_column_usage kcu
      WHERE kcu.table_name = ? 
      AND kcu.table_schema = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    `, [tableName, this.config.database]);

    return rows.map(row => ({
      columnName: row.column_name,
      referencedTable: row.foreign_table_name,
      referencedColumn: row.foreign_column_name
    }));
  }

  mapDatabaseToTypeScript(dbType, database) {
    if (database === 'postgresql') {
      const typeMap = {
        'integer': 'number',
        'bigint': 'number',
        'smallint': 'number',
        'decimal': 'number',
        'numeric': 'number',
        'real': 'number',
        'double precision': 'number',
        'character varying': 'string',
        'varchar': 'string',
        'character': 'string',
        'char': 'string',
        'text': 'string',
        'boolean': 'boolean',
        'date': 'Date',
        'timestamp without time zone': 'Date',
        'timestamp with time zone': 'Date',
        'time': 'string',
        'uuid': 'string',
        'json': 'any',
        'jsonb': 'any'
      };
      return typeMap[dbType] || 'any';
    } else {
      const typeMap = {
        'int': 'number',
        'integer': 'number',
        'bigint': 'number',
        'smallint': 'number',
        'tinyint': 'number',
        'mediumint': 'number',
        'decimal': 'number',
        'numeric': 'number',
        'float': 'number',
        'double': 'number',
        'varchar': 'string',
        'char': 'string',
        'text': 'string',
        'longtext': 'string',
        'mediumtext': 'string',
        'tinytext': 'string',
        'boolean': 'boolean',
        'bool': 'boolean',
        'bit': 'boolean',
        'date': 'Date',
        'datetime': 'Date',
        'timestamp': 'Date',
        'time': 'string',
        'year': 'number',
        'json': 'any',
        'blob': 'Buffer',
        'longblob': 'Buffer',
        'mediumblob': 'Buffer',
        'tinyblob': 'Buffer'
      };
      return typeMap[dbType] || 'any';
    }
  }

  mapDatabaseToTypeORM(dbType, database) {
    if (database === 'postgresql') {
      const typeMap = {
        'integer': 'int',
        'bigint': 'bigint',
        'smallint': 'smallint',
        'decimal': 'decimal',
        'numeric': 'numeric',
        'real': 'real',
        'double precision': 'double precision',
        'character varying': 'varchar',
        'varchar': 'varchar',
        'character': 'char',
        'char': 'char',
        'text': 'text',
        'boolean': 'boolean',
        'date': 'date',
        'timestamp without time zone': 'timestamp',
        'timestamp with time zone': 'timestamptz',
        'time': 'time',
        'uuid': 'uuid',
        'json': 'json',
        'jsonb': 'jsonb'
      };
      return typeMap[dbType] || 'varchar';
    } else {
      const typeMap = {
        'int': 'int',
        'integer': 'int',
        'bigint': 'bigint',
        'smallint': 'smallint',
        'tinyint': 'tinyint',
        'mediumint': 'mediumint',
        'decimal': 'decimal',
        'numeric': 'decimal',
        'float': 'float',
        'double': 'double',
        'varchar': 'varchar',
        'char': 'char',
        'text': 'text',
        'longtext': 'longtext',
        'mediumtext': 'mediumtext',
        'tinytext': 'tinytext',
        'boolean': 'boolean',
        'bool': 'boolean',
        'bit': 'bit',
        'date': 'date',
        'datetime': 'datetime',
        'timestamp': 'timestamp',
        'time': 'time',
        'year': 'year',
        'json': 'json',
        'blob': 'blob',
        'longblob': 'longblob',
        'mediumblob': 'mediumblob',
        'tinyblob': 'tinyblob'
      };
      return typeMap[dbType] || 'varchar';
    }
  }



  generateAuthDocumentation(authConfig) {
    if (!authConfig || authConfig.authType === 'none') {
      return;
    }

    const authDocs = `# 🔐 Sistema de Autenticación JWT

## Configuración Detectada

- **Tipo de autenticación**: ${authConfig.authType === 'complex' ? 'Completa con roles' : 'Simple'}
- **Tabla de usuarios**: \`${authConfig.userTable?.name || 'N/A'}\`
- **Tabla de roles**: \`${authConfig.roleTable?.name || 'N/A'}\`
- **Tabla de relación usuario-rol**: \`${authConfig.userRoleTable?.name || 'N/A'}\`
- **Tabla de perfil**: \`${authConfig.profileTable?.name || 'N/A'}\`

## Variables de Entorno Requeridas

\`\`\`env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Database Configuration
DB_TYPE=${this.dbType}
DB_HOST=localhost
DB_PORT=${this.dbType === 'postgresql' ? '5432' : '3306'}
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_NAME=your-database-name
\`\`\`

## Endpoints de Autenticación

### 🔑 Login
\`\`\`
POST /auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}
\`\`\`

### 📝 Register
\`\`\`
POST /auth/register
Content-Type: application/json

{
  "username": "new-username",
  "password": "new-password",
  "email": "email@example.com"${authConfig.profileTable ? ',\n  "profile": {\n    // Campos adicionales del perfil\n  }' : ''}
}
\`\`\`

### 👤 Profile
\`\`\`
GET /auth/profile
Authorization: Bearer your-jwt-token
\`\`\`

### 🔄 Refresh Token
\`\`\`
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "your-refresh-token"
}
\`\`\`

## Protección de Endpoints

### Protección básica con JWT:
\`\`\`typescript
@UseGuards(JwtAuthGuard)
@Get()
protectedEndpoint() {
  return 'This endpoint requires authentication';
}
\`\`\`

${authConfig.authType === 'complex' ? `### Protección basada en roles:
\`\`\`typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(1, 2) // Solo roles con ID 1 o 2
@Get()
adminOnlyEndpoint() {
  return 'This endpoint requires specific roles';
}
\`\`\`` : ''}

## Configuración Personalizada

El sistema detectó automáticamente la estructura de tu base de datos. Si necesitas ajustar la configuración, modifica el archivo:

\`src/auth/config/auth.config.ts\`

## Pruebas con Swagger

Una vez que ejecutes el proyecto, puedes probar todos los endpoints en:
\`http://localhost:3000/api/docs\`

El sistema incluye documentación automática de Swagger con ejemplos de uso.
`;

    this.writeFile('AUTH_GUIDE.md', authDocs);
  }


  async generateProject(projectConfig) {
    try {
      console.log(`🏗️  Starting project generation: ${projectConfig.name}`);

      this.progressCallback({
        type: 'progress',
        step: 'analyzing',
        message: 'Analizando estructura de base de datos...',
        percentage: 5
      });

      // Obtener tablas
      const tables = await this.getTables();
      console.log(`📊 Found ${tables.length} tables`);

      this.progressCallback({
        type: 'progress',
        step: 'structure',
        message: 'Creando estructura del proyecto...',
        percentage: 15
      });

      // Crear estructura de directorios
      this.createDirectoryStructure();

      this.progressCallback({
        type: 'progress',
        step: 'base-files',
        message: 'Generando archivos base...',
        percentage: 25
      });

      // Generar archivos base
      this.generateBaseFiles(projectConfig);

      this.progressCallback({
        type: 'progress',
        step: 'modules',
        message: 'Generando módulos para cada tabla...',
        percentage: 40
      });

      // Generar módulos para cada tabla
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        console.log(`📝 Processing table: ${table.name}`);

        // Obtener columnas con información detallada
        table.columns = await this.getTableColumns(table.name);

        await this.generateModuleFiles(table);

        const percentage = 40 + ((i + 1) / tables.length) * 30;
        this.progressCallback({
          type: 'progress',
          step: 'modules',
          message: `Procesando tabla ${i + 1}/${tables.length}: ${table.name}`,
          percentage: Math.round(percentage)
        });
      }

      this.progressCallback({
        type: 'progress',
        step: 'auth',
        message: 'Analizando y generando sistema de autenticación JWT...',
        percentage: 75
      });

      // 🆕 Generar sistema de autenticación genérico
      const authConfig = await this.generateAuthSystem(tables);

      if (authConfig && authConfig.authType !== 'none') {
        console.log(`✅ Generated ${authConfig.authType} JWT authentication system`);
      }

      this.progressCallback({
        type: 'progress',
        step: 'app-module',
        message: 'Generando módulo principal de la aplicación...',
        percentage: 85
      });

      // Generar módulo principal
      this.generateMainAppModule(tables, authConfig);

      this.progressCallback({
        type: 'progress',
        step: 'readme',
        message: 'Generando documentación...',
        percentage: 95
      });

      // Generar README con información de autenticación
      this.generateAuthDocumentation(authConfig);

      this.progressCallback({
        type: 'progress',
        step: 'completed',
        message: 'Proyecto generado exitosamente',
        percentage: 100
      });

      console.log(`✅ Project generated successfully: ${projectConfig.name}`);

      return {
        tablesProcessed: tables.length,
        authConfig: authConfig || { authType: 'none' },
        outputDir: this.outputDir
      };

    } catch (error) {
      console.error('❌ Error generating project:', error);
      throw error;
    }
  }


  async generateAuthSystem(tables) {
    console.log('🔍 Analyzing database for authentication tables...');

    const authConfig = await this.analyzeAuthTables(tables);

    if (authConfig.authType === 'none') {
      console.log('⚠️  No suitable authentication tables found. Skipping JWT generation.');
      return;
    }

    const userStructure = await this.analyzeUserTableStructure(authConfig.userTable);
    let roleStructure = null;
    let profileStructure = null;

    if (authConfig.authType === 'complex') {
      roleStructure = await this.analyzeRoleTableStructure(authConfig.roleTable);
    }

    if (authConfig.profileTable) {
      profileStructure = await this.analyzeProfileTableStructure(authConfig.profileTable);
    }

    console.log(`🔐 Generating ${authConfig.authType} JWT authentication system...`);


    // Generar archivos mejorados
    this.writeFile('src/auth/config/auth.config.ts', this.getAuthConfig(authConfig, userStructure, roleStructure, profileStructure));
    this.writeFile('src/auth/auth.module.ts', this.getGenericAuthModule(authConfig, userStructure));
    this.writeFile('src/auth/auth.service.ts', this.getGenericAuthService(authConfig, userStructure, roleStructure, profileStructure));
    this.writeFile('src/auth/auth.controller.ts', this.getGenericAuthController(authConfig));

    // DTOs mejorados
    this.writeFile('src/auth/dto/login.dto.ts', this.getGenericLoginDto());
    this.writeFile('src/auth/dto/register.dto.ts', this.getGenericRegisterDto(userStructure, profileStructure));

    // Guards (sin cambios)
    this.writeFile('src/auth/guards/jwt-auth.guard.ts', this.getJwtAuthGuard());
    this.writeFile('src/auth/guards/local-auth.guard.ts', this.getLocalAuthGuard());
    this.writeFile('src/auth/guards/roles.guard.ts', this.getGenericRolesGuard(authConfig));

    // Strategies (sin cambios)
    this.writeFile('src/auth/strategies/jwt.strategy.ts', this.getGenericJwtStrategy());
    this.writeFile('src/auth/strategies/local.strategy.ts', this.getGenericLocalStrategy());

    // Decorators (sin cambios)
    this.writeFile('src/auth/decorators/roles.decorator.ts', this.getGenericRolesDecorator(authConfig));
    this.writeFile('src/auth/decorators/current-user.decorator.ts', this.getCurrentUserDecorator());

    // Interfaces mejoradas
    this.writeFile('src/auth/interfaces/auth.interfaces.ts', this.getAuthInterfaces(userStructure, roleStructure, profileStructure));

    // 🆕 DOCUMENTACIÓN DETALLADA
    this.generateDetailedAuthDocumentation(authConfig, userStructure, roleStructure, profileStructure);

    console.log('✅ Generic JWT authentication system generated successfully!');
    console.log('📚 Check AUTH_CONFIGURATION.md for detailed setup instructions');

    return authConfig;
  }


  getAuthConfig(authConfig, userStructure, roleStructure, profileStructure) {
    return `export interface AuthConfiguration {
  authType: 'simple' | 'complex';
  userTable: {
    name: string;
    primaryKey: string;
    usernameField: string;
    emailField?: string;
    passwordField: string;
    statusField?: string;
    createdAtField?: string;
    updatedAtField?: string;
  };
  roleTable?: {
    name: string;
    primaryKey: string;
    nameField: string;
    descriptionField?: string;
    statusField?: string;
  };
  userRoleTable?: {
    name: string;
    userKeyField: string;
    roleKeyField: string;
    statusField?: string;
  };
  profileTable?: {
    name: string;
    primaryKey: string;
    userKeyField: string;
    nameFields: string[];
    emailField?: string;
  };
}

export const AUTH_CONFIG: AuthConfiguration = {
  authType: '${authConfig.authType}',
  userTable: {
    name: '${userStructure.tableName}',
    primaryKey: '${userStructure.primaryKey?.name || 'id'}',
    usernameField: '${userStructure.usernameField?.name || 'username'}',
    ${userStructure.emailField ? `emailField: '${userStructure.emailField.name}',` : ''}
    passwordField: '${userStructure.passwordField?.name || 'password'}',
    ${userStructure.statusField ? `statusField: '${userStructure.statusField.name}',` : ''}
    ${userStructure.createdAtField ? `createdAtField: '${userStructure.createdAtField.name}',` : ''}
    ${userStructure.updatedAtField ? `updatedAtField: '${userStructure.updatedAtField.name}',` : ''}
  },${roleStructure ? `
  roleTable: {
    name: '${roleStructure.tableName}',
    primaryKey: '${roleStructure.primaryKey?.name || 'id'}',
    nameField: '${roleStructure.nameField?.name || 'name'}',
    ${roleStructure.descriptionField ? `descriptionField: '${roleStructure.descriptionField.name}',` : ''}
    ${roleStructure.statusField ? `statusField: '${roleStructure.statusField.name}',` : ''}
  },` : ''}${authConfig.userRoleTable ? `
  userRoleTable: {
    name: '${authConfig.userRoleTable.name}',
    userKeyField: '${this.findUserKeyInUserRoleTable(authConfig.userRoleTable, userStructure)}',
    roleKeyField: '${this.findRoleKeyInUserRoleTable(authConfig.userRoleTable, roleStructure)}',
    ${authConfig.userRoleTable.statusField ? `statusField: '${authConfig.userRoleTable.statusField}',` : ''}
  },` : ''}${profileStructure ? `
  profileTable: {
    name: '${profileStructure.tableName}',
    primaryKey: '${profileStructure.primaryKey?.name || 'id'}',
    userKeyField: '${this.findUserKeyInProfileTable(profileStructure, userStructure)}',
    nameFields: [${profileStructure.nameFields.map(f => `'${f}'`).join(', ')}],
    ${profileStructure.emailField ? `emailField: '${profileStructure.emailField.name}',` : ''}
  },` : ''}
};

// Valores por defecto para campos faltantes
export const AUTH_DEFAULTS = {
  STATUS_ACTIVE: 'S', // Cambia según tu base de datos ('active', '1', 'S', etc.)
  STATUS_INACTIVE: 'N',
  DEFAULT_ROLE_ID: 1,
  PASSWORD_SALT_ROUNDS: 12,
  JWT_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
};`;
  }




  getGenericRegisterDto(userStructure, profileStructure) {
    return `import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ 
    description: 'Nombre de usuario único', 
    example: 'johndoe123' 
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ 
    description: 'Contraseña (mínimo 6 caracteres)', 
    example: 'password123' 
  })
  @IsString()
  @MinLength(6)
  password: string;

  ${userStructure.emailField ? `
  @ApiProperty({ 
    description: 'Dirección de email válida', 
    example: 'john@example.com',
    required: false
  })
  @IsEmail()
  @IsOptional()
  email?: string;` : ''}

  ${profileStructure ? `
  @ApiProperty({ 
    description: 'Información adicional del perfil (configurable)', 
    example: { 
      nombre: 'Juan', 
      paterno: 'Pérez',
      ${profileStructure.nameFields.includes('materno') ? 'materno: "González",' : ''}
      ${profileStructure.emailField ? 'email: "juan@example.com"' : ''}
    },
    required: false 
  })
  @IsOptional()
  @IsObject()
  profile?: Record<string, any>;` : ''}

  // 🚨 NOTA IMPORTANTE: 
  // Este DTO es una plantilla básica. Es probable que necesites modificarlo
  // según los campos obligatorios de tu base de datos específica.
  // 
  // Ejemplos de campos que podrían ser necesarios:
  // - cedula_identidad?: string;
  // - telefono?: string;
  // - fecha_nacimiento?: Date;
  // - id_persona?: number; (si es requerido en usuarios)
  // 
  // Consulta la documentación generada en AUTH_CONFIGURATION.md
}`;
  }



  // 🔧 NUEVO método en nestjs-generator.js

  generateDetailedAuthDocumentation(authConfig, userStructure, roleStructure, profileStructure) {
    const configDocs = `# 🔐 **CONFIGURACIÓN COMPLETA DEL SISTEMA JWT**

## 📋 **Resumen de Configuración Detectada**

### **🎯 Tipo de Sistema:** ${authConfig.authType === 'complex' ? '**COMPLEJO** (con roles)' : '**SIMPLE** (solo usuarios)'}

### **📊 Tablas Detectadas:**
- **👤 Usuarios:** \`${authConfig.userTable?.name || 'N/A'}\`
- **🏷️ Roles:** \`${authConfig.roleTable?.name || 'N/A'}\`
- **🔗 Usuario-Rol:** \`${authConfig.userRoleTable?.name || 'N/A'}\`
- **📝 Perfil:** \`${authConfig.profileTable?.name || 'N/A'}\`

---

## ⚠️ **CONFIGURACIÓN MANUAL REQUERIDA**

> **IMPORTANTE:** El sistema generado es una plantilla base que requiere configuración manual según tu estructura específica de base de datos.

### **🔧 Pasos de Configuración Obligatorios:**

#### **1. Configurar AUTH_CONFIG**
\`\`\`typescript
// src/auth/config/auth.config.ts

export const AUTH_CONFIG: AuthConfiguration = {
  authType: '${authConfig.authType}',
  userTable: {
    name: '${userStructure.tableName}',
    primaryKey: '${userStructure.primaryKey?.name || 'id'}',
    usernameField: '${userStructure.usernameField?.name || 'username'}',
    passwordField: '${userStructure.passwordField?.name || 'password'}',
    ${userStructure.emailField ? `emailField: '${userStructure.emailField.name}',` : '// emailField: undefined, // No detectado'}
    ${userStructure.statusField ? `statusField: '${userStructure.statusField.name}',` : '// statusField: undefined, // No detectado'}
  },
  // ... resto de configuración
};
\`\`\`

#### **2. Ajustar AUTH_DEFAULTS**
\`\`\`typescript
export const AUTH_DEFAULTS = {
  STATUS_ACTIVE: 'S', // 🔧 CAMBIAR según tu BD: 'active', '1', 'S', etc.
  STATUS_INACTIVE: 'N',
  DEFAULT_ROLE_ID: 1, // 🔧 CAMBIAR por ID de rol por defecto
  PASSWORD_SALT_ROUNDS: 12,
  JWT_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
};
\`\`\`

#### **3. Configurar RegisterDto**

El DTO de registro necesita ajustes según campos obligatorios:

\`\`\`typescript
// src/auth/dto/register.dto.ts

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  // 🔧 AGREGAR campos obligatorios de tu tabla usuarios:
  ${this.getRequiredFieldsDocumentation(userStructure)}
  
  // 🔧 AGREGAR campos de perfil si aplica:
  ${profileStructure ? this.getProfileFieldsDocumentation(profileStructure) : '// Sin tabla de perfil detectada'}
}
\`\`\`

#### **4. Configurar método register() en AuthService**

El método está deshabilitado intencionalmente. Descomenta y configura:

\`\`\`typescript
// src/auth/auth.service.ts - método register()

async register(registerDto: RegisterDto): Promise<AuthResponse> {
  try {
    // 1. Verificaciones existentes (ya configurado)
    
    // 2. Hash password (ya configurado)
    
    // 3. 🔧 CONFIGURAR: Crear datos de usuario
    const userData = {
      [AUTH_CONFIG.userTable.usernameField]: registerDto.username,
      [AUTH_CONFIG.userTable.passwordField]: hashedPassword,
      
      // 🚨 AGREGAR campos obligatorios:
      ${this.getUserDataFields(userStructure)}
    };

    // 4. 🔧 CONFIGURAR: Crear perfil si aplica
    ${profileStructure ? this.getProfileCreationCode(profileStructure) : '// Sin perfil configurado'}

    // 5. 🔧 CONFIGURAR: Asignar roles por defecto
    ${authConfig.authType === 'complex' ? this.getRoleAssignmentCode(authConfig) : '// Sin sistema de roles'}

    // 6. Login automático (ya configurado)
    return this.login({
      username: registerDto.username,
      password: registerDto.password,
    });
  } catch (error) {
    console.error('Error registering user:', error);
    throw new BadRequestException('Error al registrar usuario: ' + error.message);
  }
}
\`\`\`

---

## 🗂️ **ESTRUCTURA DE CAMPOS DETECTADA**

### **📋 Tabla de Usuarios: \`${userStructure.tableName}\`**

| Campo Detectado | Tipo | Obligatorio | Configuración |
|----------------|------|-------------|---------------|
| **${userStructure.primaryKey?.name || 'id'}** | ${userStructure.primaryKey?.type || 'number'} | ✅ PK | Auto-generado |
| **${userStructure.usernameField?.name || 'username'}** | ${userStructure.usernameField?.type || 'string'} | ✅ | Campo de login |
| **${userStructure.passwordField?.name || 'password'}** | ${userStructure.passwordField?.type || 'string'} | ✅ | Hash automático |
${userStructure.emailField ? `| **${userStructure.emailField.name}** | ${userStructure.emailField.type} | ${userStructure.emailField.nullable ? '❌' : '✅'} | Email opcional |` : '| email | - | ❌ | No detectado |'}
${userStructure.statusField ? `| **${userStructure.statusField.name}** | ${userStructure.statusField.type} | ${userStructure.statusField.nullable ? '❌' : '✅'} | Estado usuario |` : '| estado | - | ❌ | No detectado |'}

**⚠️ Campos adicionales que podrían ser obligatorios:**
${this.getAdditionalRequiredFields(userStructure)}

${roleStructure ? `
### **🏷️ Tabla de Roles: \`${roleStructure.tableName}\`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| **${roleStructure.primaryKey?.name || 'id'}** | ${roleStructure.primaryKey?.type || 'number'} | ID del rol |
| **${roleStructure.nameField?.name || 'name'}** | ${roleStructure.nameField?.type || 'string'} | Nombre del rol |
${roleStructure.descriptionField ? `| **${roleStructure.descriptionField.name}** | ${roleStructure.descriptionField.type} | Descripción |` : ''}
` : ''}

${profileStructure ? `
### **📝 Tabla de Perfil: \`${profileStructure.tableName}\`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| **${profileStructure.primaryKey?.name || 'id'}** | ${profileStructure.primaryKey?.type || 'number'} | ID del perfil |
| **${profileStructure.userKeyField}** | number | FK a usuarios |
${profileStructure.nameFields.map(field => `| **${field}** | string | Campo de nombre |`).join('\n')}
${profileStructure.emailField ? `| **${profileStructure.emailField.name}** | ${profileStructure.emailField.type} | Email del perfil |` : ''}
` : ''}

---

## 🧪 **GUÍA DE TESTING**

### **1. Test de Login**
\`\`\`bash
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "username": "tu_usuario_existente",
    "password": "tu_contraseña"
  }'
\`\`\`

### **2. Test de Endpoint Protegido**
\`\`\`bash
curl -X GET http://localhost:3000/api/auth/profile \\
  -H "Authorization: Bearer TU_ACCESS_TOKEN"
\`\`\`

### **3. Variables de Entorno Requeridas**
\`\`\`env
# JWT Configuration
JWT_SECRET=tu-clave-secreta-muy-larga-y-segura-minimo-32-caracteres
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Database Configuration
DB_TYPE=${this.dbType}
DB_HOST=localhost
DB_PORT=${this.dbType === 'postgresql' ? '5432' : '3306'}
DB_USERNAME=tu_usuario
DB_PASSWORD=tu_contraseña
DB_DATABASE=${this.config.database}
\`\`\`

---

## 🚨 **ERRORES COMUNES Y SOLUCIONES**

### **Error: "Property does not exist"**
**Causa:** Tipos TypeScript estrictos vs propiedades dinámicas  
**Solución:** Ya solucionado con \`ExtendedUser\` interface

### **Error: "Property 'X' is missing"**
**Causa:** DTO requiere campos obligatorios no configurados  
**Solución:** Agregar campos obligatorios al RegisterDto

### **Error: "Cannot find service"**
**Causa:** Servicios no importados correctamente  
**Solución:** Verificar imports en auth.module.ts

---

## 📈 **PRÓXIMOS PASOS**

1. ✅ **Configurar AUTH_CONFIG** con campos correctos
2. ✅ **Ajustar RegisterDto** con campos obligatorios
3. ✅ **Implementar método register()** completo
4. ✅ **Probar endpoints** básicos
5. ✅ **Configurar roles** si aplica
6. ✅ **Agregar validaciones** adicionales
7. ✅ **Implementar middleware** personalizado si es necesario

---

## 🎯 **RESULTADO FINAL**

Una vez configurado correctamente, tendrás:

- 🔐 **Autenticación JWT** completa
- 👥 **Sistema de roles** (si aplica)
- 🛡️ **Guards y decoradores** funcionales
- 📚 **Swagger integrado** con documentación
- 🔄 **Refresh tokens** automáticos
- ⚙️ **Configuración flexible** para tu BD específica

**¡El sistema está diseñado para ser adaptable a cualquier estructura de base de datos!**
`;

    this.writeFile('AUTH_CONFIGURATION.md', configDocs);
  }



  // Métodos auxiliares para documentación
  getRequiredFieldsDocumentation(userStructure) {
    // Analizar qué campos adicionales podrían ser obligatorios
    const knownFields = ['id', 'username', 'password', 'email', 'estado', 'status'];
    // Simular campos adicionales que podrían existir
    return `
  // Ejemplos de campos que podrían ser obligatorios en tu tabla:
  // id_persona?: number;     // Si usuarios referencia a personas
  // tipo?: number;           // Si hay tipos de usuario
  // fecha?: Date;            // Si se requiere fecha de creación
  // observacion?: string;    // Si hay campo de observaciones
  // fecha_finalizacion?: Date; // Si hay expiración de cuenta
  
  // 🔧 Revisa tu tabla '${userStructure.tableName}' y agrega campos obligatorios aquí`;
  }


  getProfileFieldsDocumentation(profileStructure) {
    return `
  // Campos detectados en tabla de perfil '${profileStructure.tableName}':
  ${profileStructure.nameFields.map(field => `// ${field}?: string;`).join('\n  ')}
  ${profileStructure.emailField ? `// ${profileStructure.emailField.name}?: string;` : ''}
  
  // Estructura de perfil sugerida:
  profile?: {
    ${profileStructure.nameFields.map(field => `${field}?: string;`).join('\n    ')}
    ${profileStructure.emailField ? `${profileStructure.emailField.name}?: string;` : ''}
  };`;
  }



  getGenericRolesGuard(authConfig) {
    const roleIdType = authConfig.authType === 'complex' ? 'number' : 'string';

    return `import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<${roleIdType}[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    
    if (!user || !user.roles) {
      return false;
    }

    // Verificar si el usuario tiene al menos uno de los roles requeridos
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}`;
  }




  getProfileCreationCode(profileStructure) {
    return `
    // if (AUTH_CONFIG.profileTable && registerDto.profile) {
    //   try {
    //     const profileData = {
    //       [AUTH_CONFIG.profileTable.userKeyField]: user[AUTH_CONFIG.userTable.primaryKey],
    //       ...registerDto.profile,
    //       // 🚨 AGREGAR campos obligatorios de tabla '${profileStructure.tableName}':
    //       // id_localidad: 1, // Si es obligatorio
    //       // id_emision_cedula: 1, // Si es obligatorio
    //       // etc...
    //     };
    //     await this.${this.toCamelCase(profileStructure.tableName)}Service.create(profileData);
    //   } catch (error) {
    //     console.warn('Could not create profile:', error);
    //   }
    // }`;
  }

  getRoleAssignmentCode(authConfig) {
    return `
    // if (AUTH_CONFIG.userRoleTable) {
    //   try {
    //     const userRoleData = {
    //       [AUTH_CONFIG.userRoleTable.userKeyField]: user[AUTH_CONFIG.userTable.primaryKey],
    //       [AUTH_CONFIG.userRoleTable.roleKeyField]: AUTH_DEFAULTS.DEFAULT_ROLE_ID,
    //       ${authConfig.userRoleTable.statusField ? `[AUTH_CONFIG.userRoleTable.statusField]: AUTH_DEFAULTS.STATUS_ACTIVE,` : ''}
    //       // 🚨 AGREGAR otros campos obligatorios si los hay
    //     };
    //     await this.${this.toCamelCase(authConfig.userRoleTable.name)}Service.create(userRoleData);
    //   } catch (error) {
    //     console.warn('Could not assign default role:', error);
    //   }
    // }`;
  }

  getAdditionalRequiredFields(userStructure) {
    return `
- \`id_persona\` (si usuarios referencia tabla personas)
- \`tipo\` (si hay clasificación de usuarios)
- \`fecha\` (si fecha de creación es obligatoria)
- \`observacion\` (si campo observación es obligatorio)
- \`fecha_finalizacion\` (si hay expiración de cuenta)

**💡 Tip:** Revisa tu tabla \`${userStructure.tableName}\` en la base de datos para identificar campos obligatorios (NOT NULL).`;
  }


  getUserDataFields(userStructure) {
    return `
      // 🚨 AGREGAR campos obligatorios según tu tabla '${userStructure.tableName}':
      // id_persona: registerDto.id_persona, // Si es FK obligatoria
      // tipo: 1, // Si tienes tipos de usuario
      // fecha: new Date(), // Si fecha es obligatoria
      // estado: AUTH_DEFAULTS.STATUS_ACTIVE, // Si estado es obligatorio
      // observacion: '', // Si observacion es obligatorio
      
      // Campos detectados automáticamente:
      ${userStructure.statusField ? `[AUTH_CONFIG.userTable.statusField]: AUTH_DEFAULTS.STATUS_ACTIVE,` : ''}
      ${userStructure.createdAtField ? `[AUTH_CONFIG.userTable.createdAtField]: new Date(),` : ''}`;
  }



  getAuthInterfaces(userStructure, roleStructure, profileStructure) {
    return `// 🔧 TIPOS FLEXIBLES PARA CUALQUIER BASE DE DATOS

export interface UserPayload {
  username: string;
  sub: number | string;
  ${profileStructure ? 'profile?: ProfileData | null;' : ''}
  roles?: (number | string)[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: number | string;
    username: string;
    ${userStructure.emailField ? 'email?: string | null;' : ''}
    ${profileStructure ? 'profile?: ProfileData | null;' : ''}
    ${roleStructure ? 'roles?: RoleData[];' : ''}
  };
}

// 🔧 NUEVO: Tipo extendido para usuarios con propiedades dinámicas
export interface ExtendedUser {
  [key: string]: any; // Permite propiedades dinámicas
  profile?: any | null;
  roles?: any[];
}

${profileStructure ? `
export interface ProfileData {
  id: number | string;
  ${profileStructure.nameFields.map(field => `${field}?: string | null;`).join('\n  ')}
  ${profileStructure.emailField ? `email?: string | null;` : ''}
  ${profileStructure.phoneField ? `phone?: string | null;` : ''}
}` : ''}

${roleStructure ? `
export interface RoleData {
  id: number | string;
  name: string;
  ${roleStructure.descriptionField ? `description?: string | null;` : ''}
}` : ''}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  ${userStructure.emailField ? 'email?: string;' : ''}
  ${profileStructure ? 'profile?: Record<string, any>;' : ''}
}

// 🔧 NUEVO: Configuración de campos para documentación
export interface AuthFieldMapping {
  userTable: {
    name: string;
    primaryKey: string;
    usernameField: string;
    passwordField: string;
    emailField?: string;
    statusField?: string;
  };
  ${roleStructure ? `
  roleTable: {
    name: string;
    primaryKey: string;
    nameField: string;
    descriptionField?: string;
  };` : ''}
  ${profileStructure ? `
  profileTable: {
    name: string;
    primaryKey: string;
    userKeyField: string;
    nameFields: string[];
  };` : ''}
}`;
  }


  getGenericAuthModule(authConfig, userStructure) {
    const userTableClass = this.toPascalCase(userStructure.tableName);
    const userModuleName = `${userTableClass}Module`;

    let moduleImports = `import { ${userModuleName} } from '../modules/${userStructure.tableName}/${userStructure.tableName}.module';`;
    let modulesList = `    ${userModuleName},`;

    // 🔧 CORRECCIÓN: Evitar duplicación y manejar correctamente roles
    if (authConfig.authType === 'complex' && authConfig.roleTable && authConfig.userRoleTable) {
      const roleTableClass = this.toPascalCase(authConfig.roleTable.name);
      const userRoleTableClass = this.toPascalCase(authConfig.userRoleTable.name);
      const roleModuleName = `${roleTableClass}Module`;
      const userRoleModuleName = `${userRoleTableClass}Module`;

      if (authConfig.roleTable.name !== userStructure.tableName) {
        moduleImports += `\nimport { ${roleModuleName} } from '../modules/${authConfig.roleTable.name}/${authConfig.roleTable.name}.module';`;
        modulesList += `\n    ${roleModuleName},`;
      }

      if (authConfig.userRoleTable.name !== userStructure.tableName &&
        authConfig.userRoleTable.name !== authConfig.roleTable.name) {
        moduleImports += `\nimport { ${userRoleModuleName} } from '../modules/${authConfig.userRoleTable.name}/${authConfig.userRoleTable.name}.module';`;
        modulesList += `\n    ${userRoleModuleName},`;
      }
    }

    // 🔧 CORRECCIÓN: Profile table separado del role table
    if (authConfig.profileTable &&
      authConfig.profileTable.name !== userStructure.tableName &&
      authConfig.profileTable.name !== authConfig.roleTable?.name &&
      authConfig.profileTable.name !== authConfig.userRoleTable?.name) {

      const profileTableClass = this.toPascalCase(authConfig.profileTable.name);
      const profileModuleName = `${profileTableClass}Module`;

      moduleImports += `\nimport { ${profileModuleName} } from '../modules/${authConfig.profileTable.name}/${authConfig.profileTable.name}.module';`;
      modulesList += `\n    ${profileModuleName},`;
    }

    return `import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';${moduleImports}
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
${modulesList}
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m') 
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}`;
  }



  getGenericAuthService(authConfig, userStructure, roleStructure, profileStructure) {
    const userTableClass = this.toPascalCase(userStructure.tableName);
    const userServiceName = `${userTableClass}Service`;

    // 🔧 Manejo inteligente de servicios sin duplicación
    const servicesUsed = new Set();
    servicesUsed.add(userStructure.tableName);

    let roleImports = '';
    let roleServiceImports = '';
    let profileImports = '';
    let profileServiceImports = '';

    if (authConfig.authType === 'complex' && roleStructure && authConfig.userRoleTable) {
      const roleTableClass = this.toPascalCase(roleStructure.tableName);
      const userRoleTableClass = this.toPascalCase(authConfig.userRoleTable.name);

      if (!servicesUsed.has(roleStructure.tableName)) {
        roleImports += `\nimport { ${roleTableClass}Service } from '../modules/${roleStructure.tableName}/${roleStructure.tableName}.service';`;
        roleServiceImports += `\n    private readonly ${this.toCamelCase(roleStructure.tableName)}Service: ${roleTableClass}Service,`;
        servicesUsed.add(roleStructure.tableName);
      }

      if (!servicesUsed.has(authConfig.userRoleTable.name)) {
        roleImports += `\nimport { ${userRoleTableClass}Service } from '../modules/${authConfig.userRoleTable.name}/${authConfig.userRoleTable.name}.service';`;
        roleServiceImports += `\n    private readonly ${this.toCamelCase(authConfig.userRoleTable.name)}Service: ${userRoleTableClass}Service,`;
        servicesUsed.add(authConfig.userRoleTable.name);
      }
    }

    if (profileStructure && !servicesUsed.has(profileStructure.tableName)) {
      const profileTableClass = this.toPascalCase(profileStructure.tableName);
      profileImports = `\nimport { ${profileTableClass}Service } from '../modules/${profileStructure.tableName}/${profileStructure.tableName}.service';`;
      profileServiceImports = `\n    private readonly ${this.toCamelCase(profileStructure.tableName)}Service: ${profileTableClass}Service,`;
      servicesUsed.add(profileStructure.tableName);
    }

    return `import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ${userServiceName} } from '../modules/${userStructure.tableName}/${userStructure.tableName}.service';${profileImports}${roleImports}
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AUTH_CONFIG, AUTH_DEFAULTS } from './config/auth.config';
import { AuthResponse, UserPayload, ExtendedUser } from './interfaces/auth.interfaces';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly ${this.toCamelCase(userStructure.tableName)}Service: ${userServiceName},${profileServiceImports}${roleServiceImports}
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(usernameOrEmail: string, password: string = ''): Promise<ExtendedUser | null> {
    try {
      // 🔧 MEJORADO: Buscar usuario con tipado flexible
      const users = await this.${this.toCamelCase(userStructure.tableName)}Service.findAll();
      const user = users.find((u: any) => 
        u[AUTH_CONFIG.userTable.usernameField] === usernameOrEmail ||
        ${userStructure.emailField ? `u[AUTH_CONFIG.userTable.emailField] === usernameOrEmail` : 'false'}
      );
      
      if (!user) {
        return null;
      }

      // 🔧 MEJORADO: Verificar contraseña solo si se proporciona
      if (password) {
        const userPassword = user[AUTH_CONFIG.userTable.passwordField];
        if (!userPassword) {
          return null;
        }
        
        const isPasswordValid = await bcrypt.compare(password, userPassword);
        if (!isPasswordValid) {
          return null;
        }
      }

      // 🔧 MEJORADO: Verificar estado del usuario de forma segura
      ${userStructure.statusField ? `
      const userStatus = user[AUTH_CONFIG.userTable.statusField];
      if (userStatus && userStatus !== AUTH_DEFAULTS.STATUS_ACTIVE) {
        return null;
      }` : ''}

      // 🔧 SOLUCIONADO: Crear objeto extendido con tipado flexible
      const extendedUser: ExtendedUser = {
        ...user,
        profile: null,
        roles: []
      };
      
      // 🔧 MEJORADO: Obtener información de perfil de forma segura
      ${profileStructure ? `
      if (AUTH_CONFIG.profileTable) {
        try {
          const profiles = await this.${this.toCamelCase(profileStructure.tableName)}Service.findAll();
          const profile = profiles.find((p: any) => 
            p[AUTH_CONFIG.profileTable.userKeyField] === user[AUTH_CONFIG.userTable.primaryKey]
          );
          if (profile) {
            extendedUser.profile = profile;
          }
        } catch (error) {
          console.warn('Could not load profile:', error.message);
        }
      }` : ''}

      // 🔧 MEJORADO: Obtener roles de forma segura
      ${authConfig.authType === 'complex' && roleStructure ? `
      if (AUTH_CONFIG.roleTable && AUTH_CONFIG.userRoleTable) {
        try {
          const userRoleRelations = await this.${this.toCamelCase(authConfig.userRoleTable.name)}Service.findAll();
          const userRoleIds = userRoleRelations
            .filter((ur: any) => {
              const isUserMatch = ur[AUTH_CONFIG.userRoleTable.userKeyField] === user[AUTH_CONFIG.userTable.primaryKey];
              ${authConfig.userRoleTable.statusField ? `
              const isActive = !ur[AUTH_CONFIG.userRoleTable.statusField] || ur[AUTH_CONFIG.userRoleTable.statusField] === AUTH_DEFAULTS.STATUS_ACTIVE;
              return isUserMatch && isActive;` : `
              return isUserMatch;`}
            })
            .map((ur: any) => ur[AUTH_CONFIG.userRoleTable.roleKeyField]);

          if (userRoleIds.length > 0) {
            const roles = await this.${this.toCamelCase(roleStructure.tableName)}Service.findAll();
            const userRoles = roles.filter((r: any) => userRoleIds.includes(r[AUTH_CONFIG.roleTable.primaryKey]));
            extendedUser.roles = userRoles;
          }
        } catch (error) {
          console.warn('Could not load user roles:', error.message);
        }
      }` : ''}

      // 🔧 SOLUCIONADO: Remover password de forma segura
      const passwordField = AUTH_CONFIG.userTable.passwordField;
      const result = { ...extendedUser };
      if (result[passwordField]) {
        delete result[passwordField];
      }

      return result;
    } catch (error) {
      console.error('Error validating user:', error);
      return null;
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas o usuario inactivo');
    }

    // 🔧 MEJORADO: Construcción de payload más robusta
    const payload: UserPayload = {
      username: user[AUTH_CONFIG.userTable.usernameField],
      sub: user[AUTH_CONFIG.userTable.primaryKey],
      ${profileStructure ? `profile: user.profile ? this.formatProfile(user.profile) : null,` : ''}
      roles: user.roles ? user.roles.map((r: any) => r[AUTH_CONFIG.roleTable?.primaryKey || 'id']) : [],
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: AUTH_DEFAULTS.JWT_EXPIRES_IN });
    const refreshToken = this.jwtService.sign(
      { sub: payload.sub, username: payload.username }, 
      { expiresIn: AUTH_DEFAULTS.REFRESH_TOKEN_EXPIRES_IN }
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user[AUTH_CONFIG.userTable.primaryKey],
        username: user[AUTH_CONFIG.userTable.usernameField],
        ${userStructure.emailField ? `email: user[AUTH_CONFIG.userTable.emailField] || null,` : ''}
        ${profileStructure ? `profile: payload.profile,` : ''}
        roles: user.roles ? user.roles.map((r: any) => ({
          id: r[AUTH_CONFIG.roleTable?.primaryKey || 'id'],
          name: r[AUTH_CONFIG.roleTable?.nameField || 'name'],
          ${roleStructure?.descriptionField ? `description: r[AUTH_CONFIG.roleTable.descriptionField] || null,` : ''}
        })) : [],
      },
    };
  }

  ${profileStructure ? `
  private formatProfile(profile: any): any {
    return {
      id: profile[AUTH_CONFIG.profileTable.primaryKey],
      ${profileStructure.nameFields.map(field => `${field}: profile['${field}'] || null`).join(',\n      ')},
      ${profileStructure.emailField ? `email: profile[AUTH_CONFIG.profileTable.emailField] || null,` : ''}
    };
  }` : ''}

  // 🔧 SIMPLIFICADO: Registro básico con configuración manual requerida
  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // 🚨 DOCUMENTACIÓN: Este método necesita configuración manual
    // Modifica este método según tu estructura de base de datos específica
    
    throw new BadRequestException(
      'El registro automático no está configurado. ' +
      'Por favor, configura manualmente el método register() en auth.service.ts ' +
      'según tu estructura de base de datos específica.'
    );
    
    /* 
    // 📝 PLANTILLA PARA CONFIGURACIÓN MANUAL:
    
    try {
      // 1. Verificar si ya existe el usuario
      const users = await this.${this.toCamelCase(userStructure.tableName)}Service.findAll();
      const existingUser = users.find((u: any) => 
        u[AUTH_CONFIG.userTable.usernameField] === registerDto.username
      );
      
      if (existingUser) {
        throw new BadRequestException('El usuario ya existe');
      }

      // 2. Hash de la contraseña
      const hashedPassword = await bcrypt.hash(registerDto.password, AUTH_DEFAULTS.PASSWORD_SALT_ROUNDS);

      // 3. CONFIGURAR MANUALMENTE: Crear datos según tu estructura
      const userData = {
        [AUTH_CONFIG.userTable.usernameField]: registerDto.username,
        [AUTH_CONFIG.userTable.passwordField]: hashedPassword,
        // AGREGAR AQUÍ: Otros campos obligatorios de tu tabla usuarios
        // id_persona: ?, // Si es requerido
        // tipo: 1, // Si es requerido
        // fecha: new Date(), // Si es requerido
        // etc...
      };

      // 4. Crear usuario
      const user = await this.${this.toCamelCase(userStructure.tableName)}Service.create(userData);

      // 5. CONFIGURAR MANUALMENTE: Crear perfil si es necesario
      // if (registerDto.profile) {
      //   const profileData = {
      //     [AUTH_CONFIG.profileTable.userKeyField]: user[AUTH_CONFIG.userTable.primaryKey],
      //     // AGREGAR AQUÍ: Campos obligatorios de tu tabla de perfil
      //   };
      //   await this.${profileStructure ? this.toCamelCase(profileStructure.tableName) : 'profile'}Service.create(profileData);
      // }

      // 6. Login automático
      return this.login({
        username: registerDto.username,
        password: registerDto.password,
      });
    } catch (error) {
      console.error('Error registering user:', error);
      throw new BadRequestException('Error al registrar usuario: ' + error.message);
    }
    */
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      
      // Revalidar usuario
      const user = await this.validateUser(payload.username, '');
      if (!user) {
        throw new UnauthorizedException('Usuario no válido');
      }

      const newPayload: UserPayload = {
        username: user[AUTH_CONFIG.userTable.usernameField],
        sub: user[AUTH_CONFIG.userTable.primaryKey],
        ${profileStructure ? `profile: user.profile ? this.formatProfile(user.profile) : null,` : ''}
        roles: user.roles ? user.roles.map((r: any) => r[AUTH_CONFIG.roleTable?.primaryKey || 'id']) : [],
      };

      const accessToken = this.jwtService.sign(newPayload, { expiresIn: AUTH_DEFAULTS.JWT_EXPIRES_IN });
      return { access_token: accessToken };
    } catch (error) {
      throw new UnauthorizedException('Token de refresco inválido');
    }
  }
}`;
  }

  getAuthModule() {
    return `import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsuariosModule } from '../modules/usuarios/usuarios.module';
import { PersonasModule } from '../modules/personas/personas.module';
import { RolesModule } from '../modules/roles/roles.module';
import { PersonasRolesModule } from '../modules/personas_roles/personas_roles.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    UsuariosModule,
    PersonasModule,
    RolesModule,
    PersonasRolesModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '1d') 
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}`;
  }



  getAuthService() {
    return `import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../modules/usuarios/usuarios.service';
import { PersonasService } from '../modules/personas/personas.service';
import { PersonasRolesService } from '../modules/personas_roles/personas_roles.service';
import { RolesService } from '../modules/roles/roles.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly personasService: PersonasService,
    private readonly personasRolesService: PersonasRolesService,
    private readonly rolesService: RolesService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(usernameOrEmail: string, password: string): Promise<any> {
    try {
      // Buscar usuario por nombre_email
      const usuarios = await this.usuariosService.findAll();
      const usuario = usuarios.find(u => u.nombre_email === usernameOrEmail);
      
      if (!usuario) {
        return null;
      }

      // Verificar contraseña
      const isPasswordValid = await bcrypt.compare(password, usuario.password);
      if (!isPasswordValid) {
        return null;
      }

      // Verificar que el usuario esté activo
      if (usuario.estado !== 'S') {
        return null;
      }

      // Verificar fecha de finalización
      if (usuario.fecha_finalizacion && new Date(usuario.fecha_finalizacion) < new Date()) {
        return null;
      }

      // Obtener datos de la persona
      const persona = await this.personasService.findOne(usuario.id_persona);
      
      // Obtener roles del usuario
      const personasRoles = await this.personasRolesService.findAll();
      const userRoles = personasRoles.filter(pr => 
        pr.id_persona === persona.id_persona && pr.estado === 'S'
      );

      // Obtener detalles de los roles
      const roles = await this.rolesService.findAll();
      const userRoleDetails = userRoles.map(ur => 
        roles.find(r => r.id_rol === ur.id_rol)
      ).filter(Boolean);

      const { password: _, ...result } = usuario;
      return {
        ...result,
        persona,
        roles: userRoleDetails,
      };
    } catch (error) {
      console.error('Error validating user:', error);
      return null;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas o usuario inactivo');
    }

    const payload = {
      username: user.nombre_email,
      sub: user.id_usuario,
      persona: {
        id: user.persona.id_persona,
        nombre: user.persona.nombre,
        paterno: user.persona.paterno,
        materno: user.persona.materno,
        email: user.persona.email,
      },
      roles: user.roles.map(r => r.id_rol), // Solo IDs para el token
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(
      { sub: payload.sub, username: payload.username }, 
      { expiresIn: '7d' }
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id_usuario,
        username: user.nombre_email,
        persona: payload.persona,
        roles: user.roles.map(r => ({
          id: r.id_rol,
          nombre: r.nombre,
          descripcion: r.descripcion
        })),
      },
    };
  }

  async register(registerDto: RegisterDto) {
    try {
      // Verificar si ya existe el usuario
      const usuarios = await this.usuariosService.findAll();
      const existingUser = usuarios.find(u => u.nombre_email === registerDto.username);
      
      if (existingUser) {
        throw new BadRequestException('El nombre de usuario ya existe');
      }

      // Verificar si ya existe persona con la misma cédula
      const personas = await this.personasService.findAll();
      const existingPersona = personas.find(p => 
        p.numero_identificacion_personal === registerDto.cedula_identidad
      );

      if (existingPersona) {
        throw new BadRequestException('Ya existe una persona con esta cédula de identidad');
      }

      // Hash de la contraseña
      const hashedPassword = await bcrypt.hash(registerDto.password, 12);

      // Crear persona primero
      const persona = await this.personasService.create({
        nombre: registerDto.nombre,
        paterno: registerDto.apellido_paterno,
        materno: registerDto.apellido_materno || '',
        numero_identificacion_personal: registerDto.cedula_identidad,
        email: registerDto.email,
        telefono_celular: registerDto.telefono || '',
        id_localidad: 1, // Por defecto
        id_emision_cedula: 1, // Por defecto
        id_sexo: 1, // Por defecto
        id_grupo_sanguineo: 1, // Por defecto
        id_estado_civil: 1, // Por defecto
        fecha_nacimiento: new Date('1990-01-01'),
        direccion: 'Sin especificar',
        estado: 'S',
      });

      // Crear usuario
      const usuario = await this.usuariosService.create({
        nombre_email: registerDto.username,
        password: hashedPassword,
        id_persona: persona.id_persona,
        tipo: 1,
        fecha: new Date(),
        fecha_finalizacion: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        estado: 'S',
      });

      // Asignar rol por defecto (rol básico)
      await this.personasRolesService.create({
        id_persona: persona.id_persona,
        id_rol: 1, // Rol básico por defecto
        fecha_asignacion: new Date(),
        estado: 'S',
      });

      // Login automático
      return this.login({
        username: registerDto.username,
        password: registerDto.password,
      });
    } catch (error) {
      console.error('Error registering user:', error);
      throw new BadRequestException('Error al registrar usuario: ' + error.message);
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      
      // Revalidar usuario
      const user = await this.validateUser(payload.username, '');
      if (!user) {
        throw new UnauthorizedException('Usuario no válido');
      }

      const newPayload = {
        username: user.nombre_email,
        sub: user.id_usuario,
        persona: {
          id: user.persona.id_persona,
          nombre: user.persona.nombre,
          paterno: user.persona.paterno,
          materno: user.persona.materno,
          email: user.persona.email,
        },
        roles: user.roles.map(r => r.id_rol),
      };

      const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
      return { access_token: accessToken };
    } catch (error) {
      throw new UnauthorizedException('Token de refresco inválido');
    }
  }
}`;
  }




  // Métodos faltantes para análisis de estructuras
  async analyzeRoleTableStructure(roleTable) {
    const columns = await this.getTableColumns(roleTable.name);

    const structure = {
      tableName: roleTable.name,
      primaryKey: null,
      nameField: null,
      descriptionField: null,
      statusField: null,
      createdAtField: null
    };

    for (const col of columns) {
      const colName = col.name.toLowerCase();

      if (col.isPrimaryKey) {
        structure.primaryKey = col;
      }

      if (['name', 'nombre', 'rol_nombre', 'role_name'].includes(colName)) {
        structure.nameField = col;
      }

      if (['description', 'descripcion', 'desc'].includes(colName)) {
        structure.descriptionField = col;
      }

      if (['status', 'estado', 'active'].includes(colName)) {
        structure.statusField = col;
      }

      if (['created_at', 'fecha_creacion', 'created'].includes(colName)) {
        structure.createdAtField = col;
      }
    }

    return structure;
  }

  async analyzeUserRoleTableStructure(userRoleTable) {
    const columns = await this.getTableColumns(userRoleTable.name);

    const structure = {
      tableName: userRoleTable.name,
      primaryKey: null,
      userKeyField: null,
      roleKeyField: null,
      statusField: null,
      assignedAtField: null
    };

    for (const col of columns) {
      const colName = col.name.toLowerCase();

      if (col.isPrimaryKey) {
        structure.primaryKey = col;
      }

      if (['user_id', 'usuario_id', 'id_usuario', 'id_persona'].includes(colName)) {
        structure.userKeyField = col;
      }

      if (['role_id', 'rol_id', 'id_rol'].includes(colName)) {
        structure.roleKeyField = col;
      }

      if (['status', 'estado'].includes(colName)) {
        structure.statusField = col;
      }

      if (['assigned_at', 'fecha_asignacion', 'created_at'].includes(colName)) {
        structure.assignedAtField = col;
      }
    }

    return structure;
  }

  async analyzeProfileTableStructure(profileTable) {
    const columns = await this.getTableColumns(profileTable.name);

    const structure = {
      tableName: profileTable.name,
      primaryKey: null,
      userKeyField: null,
      nameFields: [],
      emailField: null,
      phoneField: null
    };

    for (const col of columns) {
      const colName = col.name.toLowerCase();

      if (col.isPrimaryKey) {
        structure.primaryKey = col;
      }

      if (['user_id', 'usuario_id', 'id_usuario', 'id_persona'].includes(colName)) {
        structure.userKeyField = col;
      }

      if (['nombre', 'name', 'first_name', 'paterno', 'materno', 'apellido_paterno', 'apellido_materno'].includes(colName)) {
        structure.nameFields.push(col.name);
      }

      if (['email', 'correo', 'email_address'].includes(colName)) {
        structure.emailField = col;
      }

      if (['phone', 'telefono', 'telefono_celular', 'celular'].includes(colName)) {
        structure.phoneField = col;
      }
    }

    return structure;
  }


  findUserKeyInUserRoleTable(userRoleTable, userStructure) {
    const possibleKeys = ['user_id', 'usuario_id', 'id_usuario', 'id_persona'];
    const tableName = userRoleTable.name.toLowerCase();

    if (tableName.includes('persona')) {
      return 'id_persona';
    }

    // 🔧 MEJORAR: Buscar en las columnas reales de la tabla
    if (userRoleTable.columns && userRoleTable.columns.length > 0) {
      const foundKey = possibleKeys.find(key =>
        userRoleTable.columns.some(col => col.name === key)
      );
      if (foundKey) return foundKey;
    }

    return possibleKeys.find(key => userStructure.tableName.toLowerCase().includes(key.split('_')[1])) || 'user_id';
  }

  findRoleKeyInUserRoleTable(userRoleTable, roleStructure) {
    // Buscar campo que apunte al rol
    const possibleKeys = ['role_id', 'rol_id', 'id_rol'];
    return possibleKeys.find(key => userRoleTable.columns?.some(col => col.name === key)) || 'role_id';
  }

  findUserKeyInProfileTable(profileStructure, userStructure) {
    // Buscar campo que apunte al usuario
    const possibleKeys = ['user_id', 'usuario_id', 'id_usuario', 'id_persona'];

    if (profileStructure.tableName.toLowerCase().includes('persona')) {
      return 'id_persona';
    }

    return possibleKeys.find(key => profileStructure.columns?.some(col => col.name === key)) || 'user_id';
  }

  // Métodos para generar archivos Auth genéricos
  getGenericLoginDto() {
    return `import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ 
    description: 'Nombre de usuario o email', 
    example: 'admin@example.com'
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ 
    description: 'Contraseña del usuario', 
    example: 'password123' 
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}`;
  }

  getGenericAuthController(authConfig) {
    return `import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Login exitoso',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        refresh_token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            ${authConfig.authType === 'complex' ? 'roles: { type: "array" },' : ''}
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Error en el registro' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  getProfile(@Request() req) {
    return req.user;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar token de acceso' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refresh_token: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  async refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }
}`;
  }

  getGenericJwtStrategy() {
    return `import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      username: payload.username,
      profile: payload.profile,
      roles: payload.roles || [],
    };
  }
}`;
  }

  getGenericLocalStrategy() {
    return `import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}`;
  }

  getGenericRolesDecorator(authConfig) {
    const roleType = authConfig.authType === 'complex' ? 'number' : 'string';
    return `import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ${roleType}[]) => SetMetadata(ROLES_KEY, roles);`;
  }


  getAuthController() {
    return `import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Login exitoso',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        refresh_token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            username: { type: 'string' },
            persona: { type: 'object' },
            roles: { type: 'array' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Error en el registro' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  getProfile(@Request() req) {
    return req.user;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar token de acceso' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refresh_token: { type: 'string' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  @ApiResponse({ status: 401, description: 'Token inválido' })
  async refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }
}`;
  }


  getLoginDto() {
    return `import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ 
    description: 'Nombre de usuario o email', 
    example: 'admin@example.com'
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ 
    description: 'Contraseña del usuario', 
    example: 'password123' 
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}`;
  }


  getJwtAuthGuard() {
    return `import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}`;
  }


  getLocalAuthGuard() {
    return `import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}`;
  }




  getRolesGuard() {
    return `import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<number[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    
    if (!user || !user.roles) {
      return false;
    }

    // user.roles debe ser un array de números (IDs de roles)
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}`;
  }



  getJwtStrategy() {
    return `import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      username: payload.username,
      persona: payload.persona,
      roles: payload.roles, // Array de IDs de roles
    };
  }
}`;
  }


  getLocalStrategy() {
    return `import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}`;
  }


  getRolesDecorator() {
    return `import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: number[]) => SetMetadata(ROLES_KEY, roles);`;
  }




  getCurrentUserDecorator() {
    return `import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);`;
  }



  getRegisterDto() {
    return `import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'Nombre de usuario', example: 'johndoe' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: 'Contraseña', example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: 'Nombre', example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ description: 'Apellido paterno', example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  apellido_paterno: string;

  @ApiProperty({ description: 'Apellido materno', example: 'González', required: false })
  @IsString()
  @IsOptional()
  apellido_materno?: string;

  @ApiProperty({ description: 'Cédula de identidad', example: '12345678' })
  @IsString()
  @IsNotEmpty()
  cedula_identidad: string;

  @ApiProperty({ description: 'Email', example: 'juan@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Teléfono', example: '+591 70123456', required: false })
  @IsString()
  @IsOptional()
  telefono?: string;
}`;
  }





  createDirectoryStructure() {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'src'),
      path.join(this.outputDir, 'src', 'modules'),
      path.join(this.outputDir, 'src', 'common'),
      path.join(this.outputDir, 'src', 'common', 'decorators'),
      path.join(this.outputDir, 'src', 'common', 'filters'),
      path.join(this.outputDir, 'src', 'common', 'guards'),
      path.join(this.outputDir, 'src', 'common', 'interceptors'),
      path.join(this.outputDir, 'src', 'common', 'middleware'),
      path.join(this.outputDir, 'src', 'common', 'pipes'),
      path.join(this.outputDir, 'src', 'config'),
      path.join(this.outputDir, 'src', 'database'),
      path.join(this.outputDir, 'src', 'database', 'migrations'),
      path.join(this.outputDir, 'src', 'utils'),
      path.join(this.outputDir, 'test'),
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }



  generateBaseFiles(projectConfig) {
    // Archivos de configuración del proyecto
    this.writeFile('package.json', this.getPackageJson(projectConfig));
    this.writeFile('tsconfig.json', this.getTsConfig());
    this.writeFile('tsconfig.build.json', this.getTsBuildConfig());
    this.writeFile('nest-cli.json', this.getNestCliConfig());
    this.writeFile('.eslintrc.js', this.getEslintConfig());
    this.writeFile('.prettierrc', this.getPrettierConfig());
    this.writeFile('.gitignore', this.getGitignore());
    this.writeFile('README.md', this.getReadme(projectConfig));
    this.writeFile('.env', this.getEnvFile());
    this.writeFile('.env.example', this.getEnvExampleFile());

    // Archivos principales
    this.writeFile('src/main.ts', this.getMainTs());
    this.writeFile('src/config/app.config.ts', this.getAppConfig());
    this.writeFile('src/config/database.config.ts', this.getDatabaseConfig());

    // Common files
    this.writeFile('src/common/filters/http-exception.filter.ts', this.getHttpExceptionFilter());
    this.writeFile('src/common/interceptors/logging.interceptor.ts', this.getLoggingInterceptor());
    this.writeFile('src/common/middleware/logger.middleware.ts', this.getLoggerMiddleware());
    this.writeFile('src/common/pipes/validation.pipe.ts', this.getValidationPipe());

    // Utils
    this.writeFile('src/utils/helpers.ts', this.getHelpers());

    // Test files
    this.writeFile('test/jest-e2e.json', this.getJestE2EConfig());
  }
  async generateModuleFiles(table) {
    // Crear directorios específicos para cada tabla
    const moduleDir = path.join(this.outputDir, 'src', 'modules', table.name);
    const dtoDir = path.join(moduleDir, 'dto');
    const entitiesDir = path.join(moduleDir, 'entities');

    [moduleDir, dtoDir, entitiesDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    this.writeFile(
      `src/modules/${table.name}/entities/${table.name}.entity.ts`,
      this.generateEntity(table)
    );

    this.writeFile(
      `src/modules/${table.name}/dto/create-${table.name}.dto.ts`,
      this.generateCreateDto(table)
    );

    this.writeFile(
      `src/modules/${table.name}/dto/update-${table.name}.dto.ts`,
      this.generateUpdateDto(table)
    );

    this.writeFile(
      `src/modules/${table.name}/${table.name}.service.ts`,
      this.generateService(table)
    );

    this.writeFile(
      `src/modules/${table.name}/${table.name}.service.spec.ts`,
      this.generateServiceSpec(table)
    );

    this.writeFile(
      `src/modules/${table.name}/${table.name}.controller.ts`,
      this.generateController(table)
    );

    this.writeFile(
      `src/modules/${table.name}/${table.name}.controller.spec.ts`,
      this.generateControllerSpec(table)
    );

    this.writeFile(
      `src/modules/${table.name}/${table.name}.module.ts`,
      this.generateModule(table)
    );
  }

  writeFile(filePath, content) {
    let fullPath;

    if (path.isAbsolute(filePath)) {
      fullPath = filePath;
    } else {
      fullPath = path.join(this.outputDir, filePath);
    }

    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
  }

  // Métodos de generación de templates

  generateEntity(table) {
    const className = this.toPascalCase(table.name);
    let imports = ['Entity', 'Column'];

    if (table.columns.some(col => col.isPrimaryKey)) {
      imports.push('PrimaryGeneratedColumn', 'PrimaryColumn');
    }

    const uniqueImports = [...new Set(imports)];
    const typeormImport = `import { ${uniqueImports.join(', ')} } from 'typeorm';`;

    const columnsCode = table.columns.map(col => {
      let decorators = [];

      if (col.isPrimaryKey) {
        if (col.isAutoIncrement) {
          decorators.push('@PrimaryGeneratedColumn()');
        } else {
          decorators.push('@PrimaryColumn()');
        }
      } else {
        let columnOptions = [];

        if (col.dbType) {
          const typeormType = this.mapDatabaseToTypeORM(col.dbType, this.dbType);
          columnOptions.push(`type: '${typeormType}'`);
        }

        if (col.nullable) {
          columnOptions.push('nullable: true');
        } else {
          columnOptions.push('nullable: false');
        }

        if (col.maxLength && this.shouldAddLength(col.dbType)) {
          columnOptions.push(`length: ${col.maxLength}`);
        }

        const defaultValue = this.normalizeDefault(col.defaultValue, col.type);
        if (defaultValue !== undefined && defaultValue !== null) {
          columnOptions.push(`default: ${defaultValue}`);
        }

        const optionsStr = columnOptions.length > 0 ? `{ ${columnOptions.join(', ')} }` : '';
        decorators.push(`@Column(${optionsStr})`);
      }

      const tsType = col.nullable ? `${col.type} | null` : col.type;

      return `  ${decorators.join('\n  ')}\n  ${col.name}: ${tsType};`;
    }).join('\n\n');

    return `${typeormImport}

@Entity('${table.name}')
export class ${className} {
${columnsCode}
}`;
  }

  // Agregar `return` en los métodos:
  shouldAddLength(dbType) {
    if (!dbType) return false; 

    const dbTypeLower = dbType.toLowerCase();

    const typesWithoutLength = [
      'json', 'jsonb',
      'text', 'longtext', 'mediumtext', 'tinytext',
      'blob', 'longblob', 'mediumblob', 'tinyblob',
      'int', 'integer', 'bigint', 'smallint', 'tinyint', 'mediumint',
      'float', 'double', 'decimal', 'numeric',
      'boolean', 'bool', 'bit',
      'date', 'datetime', 'timestamp', 'time', 'year'
    ];

    if (typesWithoutLength.includes(dbTypeLower)) {
      return false; 
    }

    const typesWithLength = [
      'varchar', 'char', 'character varying', 'character'
    ];

    return typesWithLength.includes(dbTypeLower);
  }

  normalizeDefault(dbDefault, tsType) {
    if (!dbDefault) return undefined; 
    let val = dbDefault.trim();

    if (val.includes('nextval') || val.includes('auto_increment')) return undefined; 

    // Remover paréntesis externos
    while (val.startsWith('(') && val.endsWith(')')) {
      val = val.slice(1, -1).trim();
    }

    // Remover casting de PostgreSQL
    if (val.includes('::')) {
      val = val.split('::')[0].trim();
    }

    // Funciones de fecha
    if (/^(now\(\)|current_timestamp|current_timestamp\(\))$/i.test(val)) {
      return undefined; 
    }

    // Booleanos
    if (/^(true|false)$/i.test(val)) {
      return val.toLowerCase(); 
    }

    // Números
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      return val; 
    }

    // Strings (remover comillas)
    if (/^['"].*['"]$/.test(val)) {
      return val; 
    }

    if (val.toLowerCase() === 'null') return undefined; 

    return undefined;
  }



  generateCreateDto(table) {
    const className = this.toPascalCase(table.name);
    const dtoName = `Create${className}Dto`;

    const fields = table.columns
      .filter(col => !col.isAutoIncrement)
      .map(col => {
        let decorators = [];

        if (!col.nullable) {
          decorators.push('@IsNotEmpty()');
        } else {
          decorators.push('@IsOptional()');
        }

        if (col.type === 'string') {
          decorators.push('@IsString()');
          if (col.maxLength) {
            decorators.push(`@MaxLength(${col.maxLength})`);
          }
        } else if (col.type === 'number') {
          decorators.push('@IsNumber()');
        } else if (col.type === 'boolean') {
          decorators.push('@IsBoolean()');
        } else if (col.type === 'Date') {
          decorators.push('@IsDateString()');
        }

        return `  ${decorators.join('\n  ')}\n  ${col.name}${col.nullable ? '?' : ''}: ${col.type};`;
      }).join('\n\n');

    return `import {
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class ${dtoName} {
${fields}
}`;
  }

  generateUpdateDto(table) {
    const className = this.toPascalCase(table.name);
    const createDtoName = `Create${className}Dto`;
    const updateDtoName = `Update${className}Dto`;

    return `import { PartialType } from '@nestjs/mapped-types';
import { ${createDtoName} } from './create-${table.name}.dto';

export class ${updateDtoName} extends PartialType(${createDtoName}) {}`;
  }


  generateController(table) {
    const className = this.toPascalCase(table.name);
    const serviceName = `${className}Service`;
    const controllerName = `${className}Controller`;
    const createDtoName = `Create${className}Dto`;
    const updateDtoName = `Update${className}Dto`;
    const primaryKey = table.columns.find(col => col.isPrimaryKey);
    const pkType = primaryKey?.type || 'number';
    const paramDecorator = pkType === 'number' ? '@Param(\'id\', ParseIntPipe)' : '@Param(\'id\')';
    const parseIntImport = pkType === 'number' ? ', ParseIntPipe' : '';

    return `import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode${parseIntImport}
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { ${serviceName} } from './${table.name}.service';
import { ${createDtoName} } from './dto/create-${table.name}.dto';
import { ${updateDtoName} } from './dto/update-${table.name}.dto';
import { ${className} } from './entities/${table.name}.entity';

@ApiTags('${table.name}')
@Controller('${table.name}')
export class ${controllerName} {
  constructor(private readonly ${this.toCamelCase(table.name)}Service: ${serviceName}) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ${table.name}' })
  @ApiResponse({ status: 201, description: 'The ${table.name} has been successfully created.', type: ${className} })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 409, description: 'Conflict - Record already exists.' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: ${createDtoName}): Promise<${className}> {
    return await this.${this.toCamelCase(table.name)}Service.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all ${table.name} records' })
  @ApiResponse({ status: 200, description: 'List of all ${table.name} records.', type: [${className}] })
  async findAll(): Promise<${className}[]> {
    return await this.${this.toCamelCase(table.name)}Service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a ${table.name} by id' })
  @ApiResponse({ status: 200, description: 'The ${table.name} record.', type: ${className} })
  @ApiResponse({ status: 404, description: '${className} not found.' })
  async findOne(${paramDecorator} id: ${pkType}): Promise<${className}> {
    return await this.${this.toCamelCase(table.name)}Service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a ${table.name}' })
  @ApiResponse({ status: 200, description: 'The ${table.name} has been successfully updated.', type: ${className} })
  @ApiResponse({ status: 404, description: '${className} not found.' })
  @ApiResponse({ status: 409, description: 'Conflict - Update failed.' })
  async update(
    ${paramDecorator} id: ${pkType},
    @Body() updateDto: ${updateDtoName}
  ): Promise<${className}> {
    return await this.${this.toCamelCase(table.name)}Service.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a ${table.name}' })
  @ApiResponse({ status: 204, description: 'The ${table.name} has been successfully deleted.' })
  @ApiResponse({ status: 404, description: '${className} not found.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(${paramDecorator} id: ${pkType}): Promise<void> {
    await this.${this.toCamelCase(table.name)}Service.remove(id);
  }
}`;
  }

  generateModule(table) {
    const className = this.toPascalCase(table.name);
    const serviceName = `${className}Service`;
    const controllerName = `${className}Controller`;
    const moduleName = `${className}Module`;

    return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${controllerName} } from './${table.name}.controller';
import { ${serviceName} } from './${table.name}.service';
import { ${className} } from './entities/${table.name}.entity';

@Module({
  imports: [TypeOrmModule.forFeature([${className}])],
  controllers: [${controllerName}],
  providers: [${serviceName}],
  exports: [${serviceName}],
})
export class ${moduleName} {}`;
  }



  generateService(table) {
    const className = this.toPascalCase(table.name);
    const serviceName = `${className}Service`;
    const primaryKey = table.columns.find(col => col.isPrimaryKey);
    const pkName = primaryKey?.name || 'id';
    const pkType = primaryKey?.type || 'number';

    return `import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Create${className}Dto } from './dto/create-${table.name}.dto';
import { Update${className}Dto } from './dto/update-${table.name}.dto';
import { ${className} } from './entities/${table.name}.entity';

@Injectable()
export class ${serviceName} {
  constructor(
    @InjectRepository(${className})
    private readonly ${this.toCamelCase(table.name)}Repository: Repository<${className}>,
  ) {}

  async create(createDto: Create${className}Dto): Promise<${className}> {
    const entity = this.${this.toCamelCase(table.name)}Repository.create(createDto);
    return await this.${this.toCamelCase(table.name)}Repository.save(entity);
  }

  async findAll(): Promise<${className}[]> {
    return await this.${this.toCamelCase(table.name)}Repository.find();
  }

  async findOne(${pkName}: ${pkType}): Promise<${className}> {
    const entity = await this.${this.toCamelCase(table.name)}Repository.findOne({
      where: { ${pkName} } as any,
    });

    if (!entity) {
      throw new NotFoundException(\`${className} with ${pkName} \${${pkName}} not found\`);
    }

    return entity;
  }

  async update(${pkName}: ${pkType}, updateDto: Update${className}Dto): Promise<${className}> {
    const entity = await this.findOne(${pkName});
    Object.assign(entity, updateDto);
    return await this.${this.toCamelCase(table.name)}Repository.save(entity);
  }

  async remove(${pkName}: ${pkType}): Promise<void> {
    const entity = await this.findOne(${pkName});
    await this.${this.toCamelCase(table.name)}Repository.remove(entity);
  }
}`;
  }


  generateServiceSpec(table) {
    const className = this.toPascalCase(table.name);
    const serviceName = `${className}Service`;

    return `import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${serviceName} } from './${table.name}.service';
import { ${className} } from './entities/${table.name}.entity';

describe('${serviceName}', () => {
  let service: ${serviceName};
  let repository: Repository<${className}>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${serviceName},
        {
          provide: getRepositoryToken(${className}),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<${serviceName}>(${serviceName});
    repository = module.get<Repository<${className}>>(getRepositoryToken(${className}));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of ${table.name}', async () => {
      const result = [];
      jest.spyOn(repository, 'find').mockResolvedValue(result);

      expect(await service.findAll()).toBe(result);
    });
  });

  describe('findOne', () => {
    it('should return a single ${table.name}', async () => {
      const result = new ${className}();
      jest.spyOn(repository, 'findOne').mockResolvedValue(result);

      expect(await service.findOne(1)).toBe(result);
    });
  });

  describe('create', () => {
    it('should create a new ${table.name}', async () => {
      const createDto = {};
      const result = new ${className}();
      
      jest.spyOn(repository, 'create').mockReturnValue(result);
      jest.spyOn(repository, 'save').mockResolvedValue(result);

      expect(await service.create(createDto)).toBe(result);
    });
  });
});`;
  }


  generateControllerSpec(table) {
    const className = this.toPascalCase(table.name);
    const controllerName = `${className}Controller`;
    const serviceName = `${className}Service`;

    return `import { Test, TestingModule } from '@nestjs/testing';
import { ${controllerName} } from './${table.name}.controller';
import { ${serviceName} } from './${table.name}.service';

describe('${controllerName}', () => {
  let controller: ${controllerName};
  let service: ${serviceName};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [${controllerName}],
      providers: [
        {
          provide: ${serviceName},
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<${controllerName}>(${controllerName});
    service = module.get<${serviceName}>(${serviceName});
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of ${table.name}', async () => {
      const result = [];
      jest.spyOn(service, 'findAll').mockResolvedValue(result);

      expect(await controller.findAll()).toBe(result);
    });
  });

  describe('findOne', () => {
    it('should return a single ${table.name}', async () => {
      const result = {};
      jest.spyOn(service, 'findOne').mockResolvedValue(result);

      expect(await controller.findOne(1)).toBe(result);
    });
  });

  describe('create', () => {
    it('should create a new ${table.name}', async () => {
      const createDto = {};
      const result = {};
      
      jest.spyN(service, 'create').mockResolvedValue(result);

      expect(await controller.create(createDto)).toBe(result);
    });
  });
});`;
  }



  generateMainAppModule(tables, authConfig) {
    const moduleImports = tables.map(table => {
      const className = this.toPascalCase(table.name);
      return `import { ${className}Module } from './modules/${table.name}/${table.name}.module';`;
    }).join('\n');

    const modulesList = tables.map(table => {
      const className = this.toPascalCase(table.name);
      return `    ${className}Module,`;
    }).join('\n');

    // Verificar si se generó auth
    const hasAuth = authConfig && authConfig.authType !== 'none';
    const authImport = hasAuth ? "import { AuthModule } from './auth/auth.module';" : '';
    const authModule = hasAuth ? '    AuthModule,' : '';

    const appModuleContent = `import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { getDatabaseConfig } from './config/database.config';
import { getAppConfig } from './config/app.config';
${authImport}
${moduleImports}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [getAppConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [],
    }),
${authModule}
${modulesList}
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}`;

    this.writeFile('src/app.module.ts', appModuleContent);
  }


  // Métodos auxiliares
  toPascalCase(str) {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  toCamelCase(str) {
    const pascalCase = this.toPascalCase(str);
    return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
  }


  getPackageJson(projectConfig) {
    const basePackage = {
      "name": projectConfig.name || `generated-nestjs-backend-${this.dbType}`,
      "version": "1.0.0",
      "description": projectConfig.description || `Backend NestJS generado automáticamente desde base de datos ${this.dbType.toUpperCase()}`,
      "author": "NestJS Generator",
      "private": true,
      "license": "MIT",
      "scripts": {
        "build": "nest build",
        "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
        "start": "nest start",
        "start:dev": "nest start --watch",
        "start:debug": "nest start --debug --watch",
        "start:prod": "node dist/main",
        "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
        "test": "jest",
        "test:watch": "jest --watch",
        "test:cov": "jest --coverage",
        "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
        "test:e2e": "jest --config ./test/jest-e2e.json"
      },
      "dependencies": {
        "@nestjs/common": "^11.1.6",
        "@nestjs/config": "^4.0.2",
        "@nestjs/core": "^11.1.6",
        "@nestjs/jwt": "^11.0.0",
        "@nestjs/mapped-types": "^2.1.0",
        "@nestjs/passport": "^11.0.5",
        "@nestjs/platform-express": "^11.1.6",
        "@nestjs/swagger": "^11.2.0",
        "@nestjs/typeorm": "^11.0.0",
        "bcrypt": "^6.0.0",
        "class-transformer": "^0.5.1",
        "class-validator": "^0.14.2",
        "passport": "^0.7.0",
        "passport-jwt": "^4.0.1",
        "passport-local": "^1.0.0",
        "reflect-metadata": "^0.2.2",
        "rxjs": "^7.8.2",
        "swagger-ui-express": "^5.0.1",
        "typeorm": "^0.3.26",
        "mysql2": "^3.14.3"
      },
      "devDependencies": {
        "@nestjs/cli": "^11.0.10",
        "@nestjs/schematics": "^11.0.7",
        "@nestjs/testing": "^11.1.6",
        "@types/bcrypt": "^6.0.0",
        "@types/express": "^5.0.3",
        "@types/jest": "^30.0.0",
        "@types/node": "^24.3.0",
        "@types/passport-jwt": "^4.0.1",
        "@types/passport-local": "^1.0.38",
        "@types/supertest": "^6.0.3",
        "@typescript-eslint/eslint-plugin": "^8.40.0",
        "@typescript-eslint/parser": "^8.40.0",
        "eslint": "^9.34.0",
        "eslint-config-prettier": "^10.1.8",
        "eslint-plugin-prettier": "^5.5.4",
        "jest": "^30.0.5",
        "prettier": "^3.6.2",
        "source-map-support": "^0.5.21",
        "supertest": "^7.1.4",
        "ts-jest": "^29.4.1",
        "ts-loader": "^9.5.2",
        "ts-node": "^10.9.2",
        "tsconfig-paths": "^4.2.0",
        "typescript": "^5.9.2"
      }
    };

    // Agregar dependencias específicas de base de datos
    if (this.dbType === 'postgresql') {
      basePackage.dependencies['pg'] = '^8.12.0';
      basePackage.devDependencies['@types/pg'] = '^8.11.6';
    } else {
      basePackage.dependencies['mysql2'] = '^3.10.2';
    }

    return JSON.stringify(basePackage, null, 2);
  }


  // 🔧 CORREGIR getDatabaseConfig para usar función exportada correcta
  getDatabaseConfig() {
    if (this.dbType === 'postgresql') {
      return `import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

function parseBool(v?: string) {
    if (!v) return false;
    return ['1','true','yes','y','on'].includes(v.toLowerCase());
}

export const getDatabaseConfig = registerAs(
    'database',
    (): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || '${this.config.database}',
        autoLoadEntities: true,
        synchronize: parseBool(process.env.DB_SYNCHRONIZE),
        logging: parseBool(process.env.DB_LOGGING),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
);`;
    } else {
      return `import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

function parseBool(v?: string) {
    if (!v) return false;
    return ['1','true','yes','y','on'].includes(v.toLowerCase());
}

export const getDatabaseConfig = registerAs(
    'database',
    (): TypeOrmModuleOptions => ({
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || '${this.config.database}',
        autoLoadEntities: true,
        synchronize: parseBool(process.env.DB_SYNCHRONIZE),
        logging: parseBool(process.env.DB_LOGGING),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        charset: 'utf8mb4',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
);`;
    }
  }

  // 🔧 CORREGIR getEnvFile para mantener flexibilidad de ambas BD
  getEnvFile() {
    const dbPort = this.dbType === 'postgresql' ? '5432' : '3306';
    const dbUser = this.dbType === 'postgresql' ? 'postgres' : 'root';
    const dbPassword = this.config.password || '';
    const jwtSecret = this.generateJWTSecret();

    return `# Database Configuration - ${this.dbType.toUpperCase()}
DB_HOST=${this.config.host || 'localhost'}
DB_PORT=${this.config.port || dbPort}
DB_USERNAME=${this.config.user || this.config.username || dbUser}
DB_PASSWORD=${dbPassword}
DB_DATABASE=${this.config.database}
DB_LOGGING=true
DB_SYNCHRONIZE=false

# App Configuration
APP_PORT=3000
NODE_ENV=development
GLOBAL_PREFIX=api

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:5173

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d`;
  }

  generateJWTSecret() {
    return this.crypto.randomBytes(64).toString('hex');
  }


  // 🔧 CORREGIR getEnvExampleFile
  getEnvExampleFile() {
    const dbPort = this.dbType === 'postgresql' ? '5432' : '3306';
    const dbUser = this.dbType === 'postgresql' ? 'postgres' : 'root';

    return `# Database Configuration - ${this.dbType.toUpperCase()}
DB_HOST=localhost
DB_PORT=${dbPort}
DB_USERNAME=${dbUser}
DB_PASSWORD=your_password_here
DB_DATABASE=your_database_name
DB_LOGGING=true
DB_SYNCHRONIZE=false

# App Configuration
APP_PORT=3000
NODE_ENV=development
GLOBAL_PREFIX=api

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:5173

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here_change_in_production_minimum_32_characters
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d`;
  }



  getTsConfig() {
    return JSON.stringify({
      "compilerOptions": {
        "module": "commonjs",
        "declaration": true,
        "removeComments": true,
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true,
        "allowSyntheticDefaultImports": true,
        "target": "es2017",
        "sourceMap": true,
        "outDir": "./dist",
        "baseUrl": "./",
        "incremental": true,
        "skipLibCheck": true,
        "strictNullChecks": false,
        "noImplicitAny": false,
        "strictBindCallApply": false,
        "forceConsistentCasingInFileNames": false,
        "noFallthroughCasesInSwitch": false
      }
    }, null, 2);
  }

  getTsBuildConfig() {
    return JSON.stringify({
      "extends": "./tsconfig.json",
      "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
    }, null, 2);
  }

  getNestCliConfig() {
    return JSON.stringify({
      "$schema": "https://json.schemastore.org/nest-cli",
      "collection": "@nestjs/schematics",
      "sourceRoot": "src"
    }, null, 2);
  }

  getEslintConfig() {
    return `module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    '@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};`;
  }

  getPrettierConfig() {
    return JSON.stringify({
      "singleQuote": true,
      "trailingComma": "all"
    }, null, 2);
  }

  getGitignore() {
    return `# compiled output
/dist
/node_modules

# Logs
logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# OS
.DS_Store

# Tests
/coverage
/.nyc_output

# IDEs and editors
/.idea
.project
.classpath
.c9/
*.launch
.settings/
*.sublime-workspace

# IDE - VSCode
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json

# dotenv environment variables file
.env
.env.test
.env.production

# temp
.temp
.tmp

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Dependency directories
node_modules/`;
  }


  // 🔧 COMPLETAR método getReadme
  getReadme(projectConfig) {
    const projectName = projectConfig.name;
    const dbType = this.dbType.toUpperCase();
    const defaultPort = this.dbType === 'postgresql' ? '5432' : '3306';
    const defaultUser = this.dbType === 'postgresql' ? 'postgres' : 'root';

    return `# ${projectName}

Generated NestJS Backend with ${dbType} support

## 📋 Descripción

Este proyecto ha sido generado automáticamente usando el generador de backends NestJS.
Incluye una API REST completa con soporte para ${dbType}.

## 🚀 Características

- ✅ **NestJS Framework** - Framework moderno y escalable
- ✅ **TypeORM** - ORM robusto para ${dbType}
- ✅ **Swagger Documentation** - Documentación automática de API
- ✅ **Class Validation** - Validación automática de DTOs
- ✅ **Exception Filters** - Manejo centralizado de errores
- ✅ **Logging Interceptor** - Logging automático de requests
- ✅ **Environment Config** - Configuración basada en variables de entorno
- ✅ **JWT Authentication** - Sistema de autenticación listo para usar
- ✅ **CORS Support** - Configuración de CORS incluida
- ✅ **Testing Setup** - Configuración básica de tests

## 🏗️ Estructura del Proyecto

\`\`\`
src/
├── modules/              # Módulos generados por tabla
│   ├── [table-name]/
│   │   ├── entities/     # Entidades TypeORM
│   │   ├── dto/          # Data Transfer Objects
│   │   ├── [table].controller.ts
│   │   ├── [table].service.ts
│   │   └── [table].module.ts
├── common/               # Componentes compartidos
│   ├── filters/          # Exception filters
│   ├── interceptors/     # Interceptors
│   ├── middleware/       # Middleware personalizados
│   └── pipes/            # Validation pipes
├── config/               # Configuraciones
│   ├── app.config.ts
│   └── database.config.ts
├── utils/                # Utilidades
├── app.module.ts         # Módulo principal
└── main.ts               # Punto de entrada
\`\`\`

## 🛠️ Instalación

### Prerrequisitos

- Node.js (v18 o superior)
- npm o yarn
- ${dbType} (corriendo localmente o remoto)

### Pasos de instalación

1. **Instalar dependencias:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configurar variables de entorno:**
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. **Configurar base de datos en \`.env\`:**
   \`\`\`env
   DB_HOST=localhost
   DB_PORT=${defaultPort}
   DB_USERNAME=${defaultUser}
   DB_PASSWORD=tu_contraseña
   DB_DATABASE=${this.config.database}
   \`\`\`

4. **Ejecutar en modo desarrollo:**
   \`\`\`bash
   npm run start:dev
   \`\`\`

## 📊 Base de Datos

### Configuración ${dbType}

El proyecto está configurado para trabajar con ${dbType}. Asegúrate de tener ${dbType} instalado y corriendo.

#### Conexión:
- **Host:** localhost
- **Puerto:** ${defaultPort}
- **Usuario:** ${defaultUser}
- **Base de datos:** ${this.config.database}

### Sincronización

En desarrollo, TypeORM sincronizará automáticamente el esquema.
En producción, se recomienda usar migraciones.

## 🚀 Scripts Disponibles

\`\`\`bash
# Desarrollo
npm run start:dev          # Modo desarrollo con hot reload
npm run start:debug        # Modo debug

# Producción
npm run build              # Compilar proyecto
npm run start:prod         # Ejecutar en producción

# Testing
npm run test               # Tests unitarios
npm run test:e2e           # Tests end-to-end
npm run test:cov           # Coverage de tests

# Linting
npm run lint               # Ejecutar ESLint
npm run lint:fix           # Corregir errores de linting automáticamente
\`\`\`

## 📚 Documentación API

Una vez ejecutando el proyecto, la documentación Swagger estará disponible en:

**http://localhost:3000/api/docs**

## 🔧 Configuración

### Variables de Entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| \`DB_HOST\` | Host de la base de datos | localhost |
| \`DB_PORT\` | Puerto de la base de datos | ${defaultPort} |
| \`DB_USERNAME\` | Usuario de la base de datos | ${defaultUser} |
| \`DB_PASSWORD\` | Contraseña de la base de datos | - |
| \`DB_DATABASE\` | Nombre de la base de datos | ${this.config.database} |
| \`PORT\` | Puerto del servidor | 3000 |
| \`NODE_ENV\` | Entorno de ejecución | development |
| \`JWT_SECRET\` | Secreto para JWT | - |

### Configuración de CORS

Por defecto, CORS está habilitado para todos los orígenes (\`*\`).
Modifica \`CORS_ORIGIN\` en tu \`.env\` para producción.

## 🔒 Autenticación

El proyecto incluye configuración básica para JWT:
- Secreto configurable via \`JWT_SECRET\`
- Tiempo de expiración via \`JWT_EXPIRES_IN\`

## 🧪 Testing

### Tests Unitarios
\`\`\`bash
npm run test
\`\`\`

### Tests E2E
\`\`\`bash
npm run test:e2e
\`\`\`

### Coverage
\`\`\`bash
npm run test:cov
\`\`\`

## 📦 Producción

### Build
\`\`\`bash
npm run build
\`\`\`

### Ejecutar
\`\`\`bash
npm run start:prod
\`\`\`

### Consideraciones de Producción

1. **Variables de entorno:** Configura todas las variables necesarias
2. **Base de datos:** Usa migraciones en lugar de sincronización
3. **Secretos:** Cambia \`JWT_SECRET\` por uno seguro
4. **CORS:** Configura orígenes específicos
5. **Logging:** Ajusta el nivel de logging según necesidades

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una branch para tu feature (\`git checkout -b feature/AmazingFeature\`)
3. Commit tus cambios (\`git commit -m 'Add some AmazingFeature'\`)
4. Push a la branch (\`git push origin feature/AmazingFeature\`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 🛠️ Generado con

- [NestJS](https://nestjs.com/) - Framework de Node.js
- [TypeORM](https://typeorm.io/) - ORM para TypeScript
- [${dbType}](${this.dbType === 'postgresql' ? 'https://postgresql.org/' : 'https://mysql.com/'}) - Base de datos
- [Swagger](https://swagger.io/) - Documentación de API

---

**Proyecto generado automáticamente el ${new Date().toLocaleDateString('es-ES')}**`;

    const syncSection = `

## ⚠️ Configuración de Sincronización

Por defecto, **la sincronización automática está DESHABILITADA** para proteger tus datos.

### Variables de Entorno Importantes:

| Variable | Descripción | Valor Recomendado |
|----------|-------------|-------------------|
| \`DB_SYNCHRONIZE\` | Sincronización automática de esquema | \`false\` (producción) |
| \`DB_LOGGING\` | Logging de queries SQL | \`true\` (desarrollo) |

### ⚡ Habilitar Sincronización (Solo Desarrollo)

Si necesitas que TypeORM sincronice automáticamente el esquema:

\`\`\`env
DB_SYNCHRONIZE=true
\`\`\`

**⚠️ ADVERTENCIA:** 
- Usa \`DB_SYNCHRONIZE=true\` SOLO en desarrollo
- En producción, usa migraciones manuales
- La sincronización puede causar pérdida de datos

### 🔄 Migraciones (Recomendado para Producción)

\`\`\`bash
# Generar migración
npm run typeorm migration:generate -- -n InitialMigration

# Ejecutar migraciones
npm run typeorm migration:run
\`\`\`
`;

    // Agregar esta sección al README
    return `${baseReadme}${syncSection}${restOfReadme}`
  }




  // 🔧 CORREGIR getMainTs para usar imports correctos
  getMainTs() {
    return `import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix(process.env.GLOBAL_PREFIX || 'api');

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Generated NestJS API with JWT')
    .setDescription('Auto-generated API from database schema with JWT Authentication')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'Authentication endpoints')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      security: [{ 'JWT-auth': [] }],
    },
  });

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  
  console.log(\`\\n🚀 Application is running on: http://localhost:\${port}\`);
  console.log(\`📚 Swagger documentation: http://localhost:\${port}/api/docs\`);
  console.log(\`🔐 Authentication system ready\`);
  console.log(\`\\n📋 Available endpoints:\`);
  console.log(\`   POST /api/auth/login - User login\`);
  console.log(\`   POST /api/auth/register - User registration\`);
  console.log(\`   GET  /api/auth/profile - Get user profile\`);
  console.log(\`   POST /api/auth/refresh - Refresh token\\n\`);
}

bootstrap();`;
  }

  // 🔧 CORREGIR getAppConfig para usar export correcto
  getAppConfig() {
    return `import { registerAs } from '@nestjs/config';

export const getAppConfig = registerAs('app', () => ({
    port: parseInt(process.env.APP_PORT, 10) || 3000,
    globalPrefix: process.env.GLOBAL_PREFIX || 'api',
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['*'],
}));`;
  }

  // Archivos comunes básicos
  getHttpExceptionFilter() {
    return `import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: exception.getResponse(),
    };

    this.logger.error(
      \`HTTP Exception: \${request.method} \${request.url} - Status: \${status}\`,
      exception.stack,
    );

    response.status(status).json(errorResponse);
  }
}`;
  }

  getLoggingInterceptor() {
    return `import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const delay = Date.now() - now;
        
        this.logger.log(
          \`\${method} \${url} \${statusCode} - \${delay}ms\`,
        );
      }),
    );
  }
}`;
  }

  getLoggerMiddleware() {
    return `import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('User-Agent') || '';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('Content-Length');
      const responseTime = Date.now() - startTime;

      const logMessage = \`\${method} \${originalUrl} \${statusCode} \${contentLength || '-'} - \${userAgent} \${ip} - \${responseTime}ms\`;

      if (statusCode >= 400) {
        this.logger.error(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }
}`;
  }



  getValidationPipe() {
    return `import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToClass(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const errorMessages = errors.map(error => {
        return Object.values(error.constraints || {}).join(', ');
      });
      throw new BadRequestException(\`Validation failed: \${errorMessages.join('; ')}\`);
    }

    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}`;
  }

  getHelpers() {
    return `/**
 * Utility functions for the application
 */

/**
 * Converts snake_case to PascalCase
 */
export function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Converts snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  const pascalCase = toPascalCase(str);
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
}

/**
 * Converts PascalCase to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Format file size in bytes to human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}`;
  }

  getJestE2EConfig() {
    return `{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\\\.(t|j)s$": "ts-jest"
  }
}`;
  }
}

module.exports = { NestJSBackendGenerator };