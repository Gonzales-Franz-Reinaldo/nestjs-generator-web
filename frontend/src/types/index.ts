export type DatabaseType = 'postgresql' | 'mysql';

export interface DatabaseConfig {
    type: DatabaseType;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
}

export interface ProjectConfig {
    name: string;
    description?: string;
    outputPath?: string;
}

export interface GenerationConfig {
    database: DatabaseConfig;
    project: ProjectConfig;
}

export interface GenerationStatus {
    status: 'idle' | 'connecting' | 'generating' | 'success' | 'error';
    progress: number;
    message: string;
    logs: string[];
    error?: string;
}

export interface GeneratedProjectInfo {
    name: string;
    path: string;
    downloadUrl: string;
    size: string;
    createdAt: string;
    sessionId: string;
}

export interface TestConnectionResponse {
    success: boolean;
    message: string;
    tables?: string[];
}

export interface GenerateProjectResponse {
    success: boolean;
    message: string;
    projectInfo?: GeneratedProjectInfo;
    error?: string;
}