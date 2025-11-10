export interface ServerConfig {
  port: number;
  host: string;
  environment: string;
  cors: {
    origins: string[];
  };
}

export interface APIConfig {
  timeout: number;
  maxTokens: number;
  defaultTemperature: number;
}

export interface ProviderAPIConfig {
  apiKey: string | undefined;
  enabled: boolean;
}

export interface ProvidersConfig {
  claude: ProviderAPIConfig;
}

export interface FeaturesConfig {
  rateLimit: boolean;
  caching: boolean;
  logging: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  api: APIConfig;
  providers: ProvidersConfig;
  features: FeaturesConfig;
}
