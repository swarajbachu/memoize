export type Bindings = {
  DATABASE_URL: string
  REDIS_URL: string
  REDIS_TOKEN: string
  ENVIRONMENT: 'development' | 'production' | 'staging'
}
