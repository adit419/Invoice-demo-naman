interface EnvConfig {
  BE_BASE_URL: string;
  [key: string]: string | undefined;
}

const getEnvironmentConfig = (): EnvConfig => {
  const isBrowser = typeof window !== "undefined";
  if (isBrowser && (window as { _env_?: EnvConfig })._env_) {
    return (window as { _env_?: EnvConfig })._env_ as EnvConfig;
  }
  return {
    BE_BASE_URL:
      process.env.NEXT_PUBLIC_BE_BASE_URL ||
      process.env.BE_BASE_URL ||
      "http://localhost:8099",
  };
};

export const envConfig = Object.freeze(getEnvironmentConfig());
