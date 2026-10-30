module.exports = {
  apps: [
    {
      name: "fisczim",
      script: "dist/index.cjs",
      interpreter: "node",
      cwd: "/var/www/fisczim",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        ALLOW_REGISTRATION: "true",
        DATABASE_URL: "postgresql://user:password@localhost:5432/fisczim"
      }
    },
    {
      name: "fiscalstack_lesotho",
      script: "dist/index.cjs",
      interpreter: "node",
      cwd: "/var/www/fisczim",
      env: {
        NODE_ENV: "production",
        PORT: 5002,
        COUNTRY_SCOPE: "lesotho",
        ALLOW_REGISTRATION: "true",
        DATABASE_URL: "postgresql://user:password@localhost:5432/fisczim"
      }
    }
  ]
};

